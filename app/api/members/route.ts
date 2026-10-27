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
    select u.id, u.username, u.name, u.avatar_url, u.bio,
      case when u.role = 'owner' then 'owner' when u.role = 'admin' or cm.role = 'admin' then 'admin' else 'member' end as role,
      u.role as sys_role, cm.role as group_role,
      coalesce((select v.role in ('admin', 'owner') from users v where v.id = ${uid}), false) and u.banned_at is not null as banned,
      coalesce((select v.role in ('admin', 'owner') from users v where v.id = ${uid}), false) and u.muted_until > now() as muted
    from conversation_members cm join users u on u.id = cm.user_id
    where cm.conversation_id = ${cid.data}
      and exists (select 1 from conversation_members where conversation_id = ${cid.data} and user_id = ${uid})
    order by (u.role = 'owner') desc, (u.role = 'admin' or cm.role = 'admin') desc, lower(u.username) limit 1000`;
  return Response.json(rows);
}

// Kick anggota dari grup / Komunitas.
// Boleh: staf global (sesuai hierarki role) atau admin grup (hanya di grup biasa, terhadap anggota biasa).
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
  if (!allowed && c.kind === "group" && me.id !== t.id && rank(t.role) === 0 && t.group_role !== "admin") {
    const [mine] = await sql`select role from conversation_members where conversation_id = ${c.id} and user_id = ${me.id}`;
    allowed = mine?.role === "admin";
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
