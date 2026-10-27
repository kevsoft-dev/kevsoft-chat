import { after } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { broadcast, getMessage } from "@/lib/messages";

export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });

  const parsed = z.object({
    conversationId: z.string().uuid(),
    question: z.string().trim().min(1).max(200),
    options: z.array(z.string().trim().min(1).max(80)).min(2).max(6),
  }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Poll minimal 2 opsi" }, { status: 400 });

  const { conversationId, question, options } = parsed.data;
  const poll = { question, options, votes: {} as Record<string, number> };
  const body = `📊 ${question}`;

  const [row] = await sql`
    insert into messages (conversation_id, sender_id, kind, body, poll_data, expires_at)
    select ${conversationId}::uuid, ${uid}, 'user', ${body}, ${JSON.stringify(poll)}::jsonb,
      case when c.disappear_seconds > 0 then now() + make_interval(secs => c.disappear_seconds)
           else now() + interval '1 day' end
    from conversations c
    where c.id = ${conversationId}::uuid
      and exists (select 1 from conversation_members where conversation_id = ${conversationId}::uuid and user_id = ${uid})
      and not exists (select 1 from users where id = ${uid} and muted_until > now())
    returning id, created_at`;
  if (!row) return new Response("Forbidden", { status: 403 });

  after(async () => {
    try {
      await broadcast(conversationId, "message", await getMessage(row.id));
    } catch {}
  });
  return Response.json({ id: row.id, created_at: row.created_at });
}
