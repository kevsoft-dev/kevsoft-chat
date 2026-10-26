import { z } from "zod";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { pusher } from "@/lib/pusher";

const uuid = z.string().uuid();

export async function GET(req: Request) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  const cid = uuid.safeParse(new URL(req.url).searchParams.get("conversationId"));
  if (!cid.success) return new Response("Bad request", { status: 400 });

  const rows = await sql`
    select m.* from messages m
    where m.conversation_id = ${cid.data}
      and exists (select 1 from conversation_members where conversation_id = ${cid.data} and user_id = ${uid})
    order by m.created_at desc limit 50`;
  return Response.json(rows.reverse());
}

export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });

  const parsed = z.object({ conversationId: uuid, body: z.string().trim().min(1).max(4000) })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  const { conversationId, body } = parsed.data;

  // Insert hanya berhasil jika pengirim adalah anggota percakapan.
  const [msg] = await sql`
    insert into messages (conversation_id, sender_id, body)
    select ${conversationId}, ${uid}, ${body}
    where exists (select 1 from conversation_members where conversation_id = ${conversationId} and user_id = ${uid})
    returning *`;
  if (!msg) return new Response("Forbidden", { status: 403 });

  const members = await sql`select user_id from conversation_members where conversation_id = ${conversationId}`;
  try {
    await pusher.trigger(members.map((m) => `private-user-${m.user_id}`), "message", msg);
  } catch {}
  return Response.json(msg);
}
