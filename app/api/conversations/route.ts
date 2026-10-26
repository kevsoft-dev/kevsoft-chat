import { z } from "zod";
import { sql } from "@/lib/db";
import { getUserId, syncUser } from "@/lib/auth";

export async function GET() {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  await syncUser(uid);

  const rows = await sql`
    select c.id, u.name, u.email, u.avatar_url,
      (select body from messages where conversation_id = c.id order by created_at desc limit 1) as last_body,
      (select created_at from messages where conversation_id = c.id order by created_at desc limit 1) as last_at
    from conversations c
    join conversation_members me on me.conversation_id = c.id and me.user_id = ${uid}
    join conversation_members o on o.conversation_id = c.id and o.user_id <> ${uid}
    join users u on u.id = o.user_id
    where c.is_group = false
    order by last_at desc nulls last, c.created_at desc`;
  return Response.json(rows);
}

export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });

  const parsed = z.object({ email: z.string().email() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Email tidak valid" }, { status: 400 });

  const [other] = await sql`select id from users where email = ${parsed.data.email.toLowerCase()}`;
  if (!other) return Response.json({ error: "Pengguna belum mendaftar di aplikasi ini" }, { status: 404 });
  if (other.id === uid) return Response.json({ error: "Tidak bisa chat dengan diri sendiri" }, { status: 400 });

  const [existing] = await sql`
    select c.id from conversations c
    join conversation_members a on a.conversation_id = c.id and a.user_id = ${uid}
    join conversation_members b on b.conversation_id = c.id and b.user_id = ${other.id}
    where c.is_group = false limit 1`;
  if (existing) return Response.json({ id: existing.id });

  const [conv] = await sql`insert into conversations default values returning id`;
  await sql`insert into conversation_members (conversation_id, user_id)
            values (${conv.id}, ${uid}), (${conv.id}, ${other.id})`;
  return Response.json({ id: conv.id });
}
