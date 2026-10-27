import { z } from "zod";
import { sql } from "@/lib/db";
import { getStaff } from "@/lib/auth";
import { logMod } from "@/lib/audit";
import { pushTo } from "@/lib/messages";
import { rank } from "@/lib/roles";

// Daftar grup untuk Console. Dengan ?id= -> anggota grup itu (staf tidak perlu menjadi anggota).
export async function GET(req: Request) {
  const me = await getStaff();
  if (!me) return new Response("Forbidden", { status: 403 });
  const id = new URL(req.url).searchParams.get("id");

  if (id) {
    const cid = z.string().uuid().safeParse(id);
    if (!cid.success) return new Response("Bad request", { status: 400 });
    const rows = await sql`
      select u.id, u.username, u.name, u.avatar_url, u.role as sys_role, cm.role as group_role, (u.banned_at is not null) as banned,
        case when u.role = 'owner' then 'owner' when u.role = 'admin' or cm.role = 'admin' then 'admin' else 'member' end as role
      from conversation_members cm join users u on u.id = cm.user_id
      where cm.conversation_id = ${cid.data}
      order by (u.role = 'owner') desc, (u.role = 'admin' or cm.role = 'admin') desc, lower(u.username) limit 1000`;
    return Response.json(rows);
  }

  const rows = await sql`
    select c.id, c.kind, c.title, c.created_at, cu.username as creator,
      (select count(*) from conversation_members where conversation_id = c.id)::int as member_count
    from conversations c left join users cu on cu.id = c.created_by
    where c.kind in ('group', 'community')
    order by (c.kind = 'community') desc, c.created_at desc limit 200`;
  return Response.json(rows);
}

// Hapus grup (hanya owner; Komunitas tidak bisa dihapus).
export async function DELETE(req: Request) {
  const me = await getStaff();
  if (!me) return new Response("Forbidden", { status: 403 });
  if (rank(me.role) < 2) return Response.json({ error: "Hanya owner yang bisa menghapus grup" }, { status: 403 });
  const cid = z.string().uuid().safeParse(new URL(req.url).searchParams.get("id"));
  if (!cid.success) return new Response("Bad request", { status: 400 });

  const [c] = await sql`select id, title from conversations where id = ${cid.data} and kind = 'group'`;
  if (!c) return Response.json({ error: "Grup tidak ditemukan" }, { status: 404 });
  const members = await sql`select user_id from conversation_members where conversation_id = ${c.id}`;
  await sql`delete from conversations where id = ${c.id}`;
  await logMod({ actorId: me.id, actorName: me.name, action: "delete_group", targetName: String(c.title ?? "Grup") });
  await Promise.all(members.map((m) => pushTo(m.user_id as string, "conversation", { id: c.id })));
  return Response.json({ ok: true });
}
