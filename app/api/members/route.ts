import { z } from "zod";
import { sql } from "@/lib/db";
import { getActor, getUserId } from "@/lib/auth";
import { logMod } from "@/lib/audit";
import { broadcast, pushTo } from "@/lib/messages";
import { canManage, rank } from "@/lib/roles";

export async function GET(req: Request) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  const cid = z.string().uuid().safeParse(new URL(req.url).searchParams.get("conversationId"));
  if (!cid.success) return new Response("Bad request", { status: 400 });

  // role = owner / admin (global atau admin grup) / member. Status blokir hanya terlihat oleh staf.
  const rows = await sql`
    select u.id, u.username, u.name, u.avatar_url, u.banner_url, u.bio,
      coalesce(u.role = 'owner' or u.verified, false) as verified,
      case
        when cm.role = 'owner' then 'owner'
        when u.role = 'owner' then 'owner'
        when u.role = 'admin' or cm.role = 'admin' then 'admin'
        else 'member'
      end as role,
      u.role as sys_role, cm.role as group_role,
      coalesce((select v.role in ('admin', 'owner') from users v where v.id = ${uid}), false) and u.banned_at is not null as banned,
      (cm.muted_until is not null and cm.muted_until > now()) as group_muted,
      coalesce((select v.role in ('admin', 'owner') from users v where v.id = ${uid}), false) and u.muted_until > now() as muted,
      cm.muted_until as group_muted_until
    from conversation_members cm join users u on u.id = cm.user_id
    where cm.conversation_id = ${cid.data}
      and exists (select 1 from conversation_members where conversation_id = ${cid.data} and user_id = ${uid})
    order by (cm.role = 'owner') desc, (u.role = 'owner') desc, (cm.role = 'admin' or u.role = 'admin') desc, lower(u.username) limit 1000`;
  return Response.json(rows);
}

// Tambah anggota ke grup. Boleh: owner/admin grup, atau staf sistem.
export async function POST(req: Request) {
  const me = await getActor();
  if (!me) return new Response("Unauthorized", { status: 401 });

  const parsed = z.object({
    conversationId: z.string().uuid(),
    username: z.string().trim().toLowerCase().min(3).max(20).optional(),
    usernames: z.array(z.string().trim().toLowerCase().min(3).max(20)).max(30).optional(),
  }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Data tidak valid" }, { status: 400 });

  const names = [
    ...(parsed.data.username ? [parsed.data.username] : []),
    ...(parsed.data.usernames ?? []),
  ].map((n) => n.replace(/^@/, ""));
  if (names.length === 0) return Response.json({ error: "Pilih minimal 1 pengguna" }, { status: 400 });

  const cid = parsed.data.conversationId;
  const [c] = await sql`select id, kind, title from conversations where id = ${cid}::uuid and kind = 'group'`;
  if (!c) return Response.json({ error: "Hanya bisa menambah anggota di grup" }, { status: 400 });

  const [mine] = await sql`select role from conversation_members where conversation_id = ${c.id} and user_id = ${me.id}`;
  const myG = String(mine?.role || "");
  const staff = rank(me.role) >= 1;
  const canAdd = staff || myG === "owner" || myG === "admin";
  if (!canAdd) return Response.json({ error: "Hanya owner/admin grup yang bisa menambah anggota" }, { status: 403 });

  const found = await sql`
    select id, username, name from users
    where lower(username) = any(${names}::text[])
      and banned_at is null
      and id <> ${me.id}`;
  if (found.length === 0) return Response.json({ error: "Pengguna tidak ditemukan" }, { status: 404 });

  const added: string[] = [];
  const skipped: string[] = [];
  for (const u of found) {
    const [already] = await sql`select 1 from conversation_members where conversation_id = ${c.id} and user_id = ${u.id}`;
    if (already) { skipped.push(String(u.username)); continue; }

    // Hapus status kick lama supaya bisa diundang lagi
    await sql`delete from conversation_kicks where conversation_id = ${c.id} and user_id = ${u.id}`;
    await sql`
      insert into conversation_members (conversation_id, user_id, role)
      values (${c.id}, ${u.id}, 'member')
      on conflict do nothing`;
    added.push(String(u.username));
    await pushTo(u.id as string, "conversation", { id: c.id });
  }

  if (added.length) {
    await broadcast(c.id as string, "conversation", { id: c.id });
    await logMod({
      actorId: me.id,
      actorName: me.name,
      action: "add_member",
      detail: `${added.join(", ")} → ${c.title || "grup"}`,
    }).catch(() => {});
  }

  if (added.length === 0)
    return Response.json({ error: skipped.length ? "Sudah menjadi anggota" : "Tidak ada yang ditambahkan", skipped }, { status: 409 });

  return Response.json({ ok: true, added, skipped });
}

// Kick anggota dari grup / Komunitas.
// Boleh: staf global (sesuai hierarki role) atau admin/owner grup.
export async function DELETE(req: Request) {
  const me = await getActor();
  if (!me) return new Response("Unauthorized", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const cid = z.string().uuid().safeParse(sp.get("conversationId"));
  const tid = z.string().min(1).max(64).safeParse(sp.get("userId"));
  if (!cid.success || !tid.success) return new Response("Bad request", { status: 400 });

  const [c] = await sql`select id, kind, title from conversations where id = ${cid.data} and kind in ('group', 'community')`;
  if (!c) return Response.json({ error: "Percakapan tidak ditemukan" }, { status: 404 });
  const [t] = await sql`
    select u.id, u.role, u.email, u.username, u.name, cm.role as group_role
    from users u left join conversation_members cm on cm.user_id = u.id and cm.conversation_id = ${c.id}
    where u.id = ${tid.data}`;
  if (!t) return Response.json({ error: "Pengguna tidak ditemukan" }, { status: 404 });

  let allowed = rank(me.role) >= 1 && canManage(me, { id: t.id, role: String(t.role), email: t.email ?? null });
  if (!allowed && c.kind === "group" && me.id !== t.id) {
    const [mine] = await sql`select role from conversation_members where conversation_id = ${c.id} and user_id = ${me.id}`;
    const myG = String(mine?.role || "member");
    const tg = String(t.group_role || "member");
    if (myG === "owner" && tg !== "owner") allowed = true;
    else if (myG === "admin" && tg === "member" && rank(t.role) === 0) allowed = true;
  }
  if (!allowed) return Response.json({ error: "Kamu tidak bisa mengeluarkan pengguna ini" }, { status: 403 });

  await sql`delete from conversation_members where conversation_id = ${c.id} and user_id = ${t.id}`;
  await sql`
    insert into conversation_kicks (conversation_id, user_id, kicked_by) values (${c.id}, ${t.id}, ${me.id})
    on conflict (conversation_id, user_id) do update set kicked_by = excluded.kicked_by, created_at = now()`;
  await logMod({ actorId: me.id, actorName: me.name, action: "kick", targetId: t.id, targetName: String(t.username || t.name || t.id), detail: String(c.title ?? c.kind) });
  await Promise.all([pushTo(t.id, "conversation", { id: c.id }), broadcast(c.id, "conversation", { id: c.id })]);
  return Response.json({ ok: true });
}


// Bisukan / buka bisu anggota di dalam grup (bukan mute global sistem).
export async function PATCH(req: Request) {
  const me = await getActor();
  if (!me) return new Response("Unauthorized", { status: 401 });

  const parsed = z.object({
    conversationId: z.string().uuid(),
    userId: z.string().min(1).max(64),
    action: z.enum(["mute", "unmute"]),
    minutes: z.number().int().min(1).max(60 * 24 * 30).optional(), // default 60
  }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Data tidak valid" }, { status: 400 });

  const { conversationId, userId, action } = parsed.data;
  const minutes = parsed.data.minutes ?? 60;

  const [c] = await sql`select id, kind, title from conversations where id = ${conversationId}::uuid and kind = 'group'`;
  if (!c) return Response.json({ error: "Hanya untuk grup" }, { status: 400 });

  const [mine] = await sql`select role from conversation_members where conversation_id = ${c.id} and user_id = ${me.id}`;
  const myG = String(mine?.role || "");
  const staff = rank(me.role) >= 1;
  if (!staff && myG !== "owner" && myG !== "admin")
    return Response.json({ error: "Hanya owner/admin grup" }, { status: 403 });

  const [t] = await sql`
    select u.id, u.username, u.name, u.role as sys_role, cm.role as group_role
    from users u
    join conversation_members cm on cm.user_id = u.id and cm.conversation_id = ${c.id}
    where u.id = ${userId}`;
  if (!t) return Response.json({ error: "Anggota tidak ditemukan" }, { status: 404 });
  if (t.id === me.id) return Response.json({ error: "Tidak bisa bisukan diri sendiri" }, { status: 400 });

  const tg = String(t.group_role || "member");
  if (myG === "admin" && tg !== "member")
    return Response.json({ error: "Admin hanya bisa bisukan member biasa" }, { status: 403 });
  if (tg === "owner" && myG !== "owner" && !staff)
    return Response.json({ error: "Tidak bisa bisukan owner grup" }, { status: 403 });

  if (action === "mute") {
    await sql`
      update conversation_members
      set muted_until = now() + make_interval(mins => ${minutes})
      where conversation_id = ${c.id} and user_id = ${userId}`;
    await logMod({
      actorId: me.id, actorName: me.name, action: "group_mute",
      targetId: t.id, targetName: String(t.username || t.name),
      detail: `${c.title || "grup"} · ${minutes} mnt`,
    });
    await pushTo(userId, "conversation", { id: c.id, group_muted: true });
    return Response.json({ ok: true, muted: true, minutes });
  }

  await sql`
    update conversation_members set muted_until = null
    where conversation_id = ${c.id} and user_id = ${userId}`;
  await logMod({
    actorId: me.id, actorName: me.name, action: "group_unmute",
    targetId: t.id, targetName: String(t.username || t.name),
    detail: String(c.title || "grup"),
  });
  await pushTo(userId, "conversation", { id: c.id, group_muted: false });
  return Response.json({ ok: true, muted: false });
}
