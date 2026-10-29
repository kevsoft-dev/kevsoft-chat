import { after } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { broadcast, pushTo } from "@/lib/messages";

export async function GET() {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });

  // Bersihkan pesan kedaluwarsa (acak ~2% request) supaya database tidak membengkak.
  if (Math.random() < 0.02)
    after(async () => { try { await sql`delete from messages where expires_at < now() - interval '1 hour'`; } catch {} });

  const rows = await sql`
    select c.id, c.kind, c.title, c.description, coalesce(c.disappear_seconds, 0) as disappear_seconds,
      o.id as other_id, o.username as other_username, o.name as other_name,
      case when c.kind in ('group', 'community') then c.avatar_url else o.avatar_url end as other_avatar,
      o.banner_url as other_banner, o.bio as other_bio,
      coalesce(o.role = 'owner' or o.verified, false) as other_verified,
      c.created_by,
      (select cm.role from conversation_members cm where cm.conversation_id = c.id and cm.user_id = ${uid}) as my_group_role,
      (select count(*) from conversation_members where conversation_id = c.id)::int as member_count,
      lm.body as last_body, lm.created_at as last_at, lm.kind as last_kind, lu.username as last_username,
      (lm.deleted_at is not null) as last_deleted,
      (select count(*) from messages m
        where m.conversation_id = c.id and m.created_at > me.last_read_at and m.sender_id is distinct from ${uid}
          and m.deleted_at is null and not (${uid} = any(m.hidden_by))
          and (m.expires_at is null or m.expires_at > now())
          and (me.cleared_at is null or m.created_at > me.cleared_at))::int as unread,
      exists (select 1 from messages m
        where m.conversation_id = c.id and m.created_at > me.last_read_at and m.sender_id is distinct from ${uid}
          and m.deleted_at is null and not (${uid} = any(m.hidden_by))
          and (m.expires_at is null or m.expires_at > now())
          and (me.cleared_at is null or m.created_at > me.cleared_at)
          and (select lower(username) from users where id = ${uid}) = any(m.mentions)) as unread_mention
    from conversations c
    join conversation_members me on me.conversation_id = c.id and me.user_id = ${uid}
    left join conversation_members om on om.conversation_id = c.id and c.kind = 'dm' and om.user_id <> ${uid}
    left join users o on o.id = om.user_id
    left join lateral (
      select case when deleted_at is null then body else '' end as body, created_at, kind, sender_id, deleted_at
      from messages
      where conversation_id = c.id and (me.cleared_at is null or created_at > me.cleared_at)
        and not (${uid} = any(hidden_by))
        and (expires_at is null or expires_at > now())
      order by created_at desc limit 1) lm on true
    left join users lu on lu.id = lm.sender_id
    where me.hidden_at is null or lm.created_at > me.hidden_at
    order by (c.kind = 'ai') desc, lm.created_at desc nulls last, c.created_at desc`;
  return Response.json(rows);
}

const body = z.discriminatedUnion("type", [
  z.object({ type: z.literal("dm"), username: z.string().trim().toLowerCase().min(3).max(20) }),
  z.object({
    type: z.literal("group"),
    title: z.string().trim().min(1).max(60),
    description: z.string().trim().max(200).optional(),
    usernames: z.array(z.string().trim().toLowerCase().min(3).max(20)).min(1).max(100),
  }),
]);

export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Data tidak valid" }, { status: 400 });
  const d = parsed.data;

  const [me] = await sql`select username from users where id = ${uid}`;
  if (!me?.username) return Response.json({ error: "Atur username dulu" }, { status: 403 });

  if (d.type === "dm") {
    const [other] = await sql`select id from users where lower(username) = ${d.username}`;
    if (!other) return Response.json({ error: "Username tidak ditemukan" }, { status: 404 });
    if (other.id === uid) return Response.json({ error: "Tidak bisa chat dengan diri sendiri" }, { status: 400 });

    const [existing] = await sql`
      select c.id from conversations c
      join conversation_members a on a.conversation_id = c.id and a.user_id = ${uid}
      join conversation_members b on b.conversation_id = c.id and b.user_id = ${other.id}
      where c.kind = 'dm' limit 1`;
    if (existing) return Response.json({ id: existing.id });

    const [conv] = await sql`insert into conversations (kind, created_by) values ('dm', ${uid}) returning id`;
    await sql`insert into conversation_members (conversation_id, user_id)
              values (${conv.id}, ${uid}), (${conv.id}, ${other.id})`;
    await broadcast(conv.id, "conversation", { id: conv.id });
    return Response.json({ id: conv.id });
  }

  const found = await sql`select id from users where lower(username) = any(${d.usernames}) and id <> ${uid}`;
  if (found.length === 0) return Response.json({ error: "Pilih minimal 1 anggota yang valid" }, { status: 400 });
  const [conv] = await sql`
    insert into conversations (kind, title, description, created_by)
    values ('group', ${d.title}, ${d.description ?? null}, ${uid}) returning id`;
  await sql`insert into conversation_members (conversation_id, user_id, role) values (${conv.id}, ${uid}, 'owner')`;
  const ids = found.map((f) => f.id as string);
  await sql`insert into conversation_members (conversation_id, user_id)
            select ${conv.id}, x from unnest(${ids}::text[]) as x`;
  await broadcast(conv.id, "conversation", { id: conv.id });
  return Response.json({ id: conv.id });
}

// Hapus chat. mode=clear: bersihkan riwayat (hanya untuk saya). mode=delete: DM dihapus dari daftar, grup = keluar.
export async function DELETE(req: Request) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const id = z.string().uuid().safeParse(sp.get("id"));
  if (!id.success) return new Response("Bad request", { status: 400 });
  const mode = sp.get("mode") === "delete" ? "delete" : "clear";

  const [c] = await sql`
    select c.kind from conversations c
    join conversation_members cm on cm.conversation_id = c.id and cm.user_id = ${uid}
    where c.id = ${id.data}`;
  if (!c) return new Response("Not found", { status: 404 });

  if (mode === "clear" || c.kind === "ai" || c.kind === "community") {
    await sql`update conversation_members set cleared_at = now(), last_read_at = now()
              where conversation_id = ${id.data} and user_id = ${uid}`;
  } else if (c.kind === "dm") {
    await sql`update conversation_members set cleared_at = now(), hidden_at = now(), last_read_at = now()
              where conversation_id = ${id.data} and user_id = ${uid}`;
  } else {
    await sql`delete from conversation_members where conversation_id = ${id.data} and user_id = ${uid}`;
    const [rest] = await sql`
      select count(*)::int as n, (count(*) filter (where role = 'admin'))::int as admins
      from conversation_members where conversation_id = ${id.data}`;
    if (rest.n === 0) await sql`delete from conversations where id = ${id.data}`;
    else if (rest.admins === 0)
      await sql`update conversation_members set role = 'admin'
                where conversation_id = ${id.data}
                  and user_id = (select user_id from conversation_members where conversation_id = ${id.data} order by joined_at limit 1)`;
    after(() => broadcast(id.data, "conversation", { id: id.data }));
  }
  after(() => pushTo(uid, "conversation", { id: id.data }));
  return Response.json({ ok: true });
}


// Ubah nama/deskripsi grup — hanya owner grup (atau admin grup).
export async function PATCH(req: Request) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  const parsed = z.object({
    id: z.string().uuid(),
    title: z.string().trim().min(1).max(60).optional(),
    description: z.string().trim().max(200).optional().nullable(),
  }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Data tidak valid" }, { status: 400 });
  const { id, title, description } = parsed.data;
  if (title === undefined && description === undefined)
    return Response.json({ error: "Tidak ada perubahan" }, { status: 400 });

  const [mem] = await sql`
    select cm.role as member_role, c.kind, c.created_by
    from conversation_members cm
    join conversations c on c.id = cm.conversation_id
    where cm.conversation_id = ${id}::uuid and cm.user_id = ${uid}`;
  if (!mem || mem.kind !== "group") return Response.json({ error: "Hanya untuk grup" }, { status: 400 });
  const canEdit = mem.member_role === "owner" || mem.member_role === "admin" || mem.created_by === uid;
  if (!canEdit) return Response.json({ error: "Hanya owner/admin grup yang bisa mengubah info grup" }, { status: 403 });

  const [c] = await sql`
    update conversations set
      title = coalesce(${title ?? null}::text, title),
      description = case when ${description === undefined} then description else ${description ?? null}::text end
    where id = ${id}::uuid
    returning id, title, description, avatar_url`;
  await broadcast(id, "conversation", { id, title: c.title, description: c.description, avatar_url: c.avatar_url });
  return Response.json(c);
}
