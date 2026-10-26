import { after } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { aiPrompt, AI_HANDLE, parseMentions } from "@/lib/mentions";
import { askKevAi } from "@/lib/ai";
import { broadcast, getMessage } from "@/lib/messages";

export const maxDuration = 60;
const uuid = z.string().uuid();

export async function GET(req: Request) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const cid = uuid.safeParse(sp.get("conversationId"));
  if (!cid.success) return new Response("Bad request", { status: 400 });
  const before = sp.get("before");
  const beforeTs = before && !Number.isNaN(Date.parse(before)) ? new Date(before).toISOString() : null;

  const rows = await sql`
    select m.id, m.conversation_id, m.sender_id, m.kind, m.body, m.created_at, m.reply_to, m.mentions,
      case when m.kind = 'ai' then 'kev-ai' else u.username end as username,
      case when m.kind = 'ai' then 'Kev-Ai' else coalesce(u.name, u.username) end as name,
      u.avatar_url,
      left(r.body, 140) as reply_body,
      case when r.kind = 'ai' then 'kev-ai' else ru.username end as reply_username
    from messages m
    left join users u on u.id = m.sender_id
    left join messages r on r.id = m.reply_to
    left join users ru on ru.id = r.sender_id
    where m.conversation_id = ${cid.data}
      and exists (select 1 from conversation_members where conversation_id = ${cid.data} and user_id = ${uid})
      and (${beforeTs}::timestamptz is null or m.created_at < ${beforeTs}::timestamptz)
    order by m.created_at desc limit 50`;

  if (!beforeTs)
    await sql`update conversation_members set last_read_at = now()
              where conversation_id = ${cid.data} and user_id = ${uid}`;
  return Response.json(rows.reverse());
}

export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });

  const parsed = z.object({ conversationId: uuid, body: z.string().trim().min(1).max(4000), replyTo: uuid.optional() })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  const { conversationId, body, replyTo } = parsed.data;

  const [conv] = await sql`
    select c.kind from conversations c
    join conversation_members cm on cm.conversation_id = c.id and cm.user_id = ${uid}
    where c.id = ${conversationId}`;
  if (!conv) return new Response("Forbidden", { status: 403 });

  // Hanya tag yang valid (username terdaftar atau @kev-ai) yang disimpan sebagai mention.
  const wanted = parseMentions(body);
  const valid = wanted.length
    ? await sql`select lower(username) as u from users where lower(username) = any(${wanted})`
    : [];
  const mentions = [...valid.map((v) => v.u as string), ...(wanted.includes(AI_HANDLE) ? [AI_HANDLE] : [])];

  const [ins] = await sql`
    insert into messages (conversation_id, sender_id, body, mentions, reply_to)
    values (${conversationId}, ${uid}, ${body}, ${mentions},
      (select id from messages where id = ${replyTo ?? null} and conversation_id = ${conversationId}))
    returning id`;
  const msg = await getMessage(ins.id);
  await sql`update conversation_members set last_read_at = now() where conversation_id = ${conversationId} and user_id = ${uid}`;
  await broadcast(conversationId, "message", msg);

  const callAi = conv.kind === "ai" || mentions.includes(AI_HANDLE);
  if (callAi) {
    after(async () => {
      const [{ n }] = await sql`
        select count(*)::int as n from messages m join conversations c on c.id = m.conversation_id
        where m.sender_id = ${uid} and m.created_at > now() - interval '1 minute'
          and (c.kind = 'ai' or ${AI_HANDLE} = any(m.mentions))`;
      const prompt = aiPrompt(body);
      let answer: string;
      if (n > 8) answer = "Pelan-pelan ya, terlalu banyak pertanyaan dalam semenit. Coba lagi sebentar lagi.";
      else if (!prompt) answer = "Halo! Aku Kev-Ai. Tulis pertanyaanmu setelah @kev-ai, contoh: @kev-ai apa itu Next.js?";
      else answer = await askKevAi(prompt);

      const [r] = await sql`
        insert into messages (conversation_id, sender_id, kind, body, reply_to)
        values (${conversationId}, null, 'ai', ${answer}, ${ins.id}) returning id`;
      await broadcast(conversationId, "message", await getMessage(r.id));
    });
  }
  return Response.json(msg);
}
