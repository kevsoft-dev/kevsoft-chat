import { after } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { aiPrompt, AI_HANDLE, parseMentions } from "@/lib/mentions";
import { askKevAi } from "@/lib/ai";
import { broadcast, getMessage } from "@/lib/messages";
import { logMod } from "@/lib/audit";

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

  // Cek keanggotaan, filter "bersihkan chat" dan "hapus untuk saya" dalam satu query.
  const readMark = !beforeTs
    ? sql`update conversation_members set last_read_at = now() where conversation_id = ${cid.data} and user_id = ${uid}`
    : null;
  const [rows] = await Promise.all([
    sql`
      select m.id, m.conversation_id, m.sender_id, m.kind,
        case when m.deleted_at is null then m.body else '' end as body,
        m.created_at, m.deleted_at, m.reply_to, m.mentions,
        case when m.kind = 'ai' then 'kev-ai' else u.username end as username,
        case when m.kind = 'ai' then 'Kev-Ai' else coalesce(u.name, u.username) end as name,
        u.avatar_url,
        case when r.id is null then null when r.deleted_at is not null then '' else left(r.body, 140) end as reply_body,
        case when r.kind = 'ai' then 'kev-ai' else ru.username end as reply_username
      from conversation_members me
      join messages m on m.conversation_id = me.conversation_id
      left join users u on u.id = m.sender_id
      left join messages r on r.id = m.reply_to
      left join users ru on ru.id = r.sender_id
      where me.conversation_id = ${cid.data} and me.user_id = ${uid}
        and (me.cleared_at is null or m.created_at > me.cleared_at)
        and not (${uid} = any(m.hidden_by))
        and (${beforeTs}::timestamptz is null or m.created_at < ${beforeTs}::timestamptz)
      order by m.created_at desc limit 50`,
    readMark,
  ]);
  return Response.json((rows as any[]).reverse());
}

export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });

  const parsed = z.object({ id: uuid.optional(), conversationId: uuid, body: z.string().trim().min(1).max(4000), replyTo: uuid.optional() })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  const { id, conversationId, body, replyTo } = parsed.data;

  const wanted = parseMentions(body);
  const wantsAi = wanted.includes(AI_HANDLE);
  const msgId = id ?? crypto.randomUUID();

  // Satu query: cek keanggotaan + validasi tag + simpan. ID dari klien membuat kirim ulang aman (idempoten).
  const rows = await sql`
    insert into messages (id, conversation_id, sender_id, body, mentions, reply_to)
    select ${msgId}::uuid, ${conversationId}::uuid, ${uid}, ${body},
      array(select lower(username) from users where lower(username) = any(${wanted}::text[]))
        || ${wantsAi ? [AI_HANDLE] : []}::text[],
      (select id from messages where id = ${replyTo ?? null}::uuid and conversation_id = ${conversationId}::uuid)
    where exists (select 1 from conversation_members where conversation_id = ${conversationId}::uuid and user_id = ${uid})
      and not exists (select 1 from users where id = ${uid} and muted_until > now())
    on conflict (id) do nothing
    returning id, created_at, mentions`;

  if (rows.length === 0) {
    // Sudah tersimpan (kirim ulang)? Kembalikan hasil yang sama. Selain itu berarti bukan anggota.
    const [ex] = await sql`select id, created_at, mentions from messages where id = ${msgId}::uuid and sender_id = ${uid}`;
    if (!ex) {
      const [mu] = await sql`select muted_until from users where id = ${uid} and muted_until > now()`;
      if (mu) return Response.json({ error: "Kamu sedang dibisukan oleh moderator", muted: true }, { status: 403 });
      return new Response("Forbidden", { status: 403 });
    }
    return Response.json(ex);
  }
  const row = rows[0];

  // Balas klien secepat mungkin; siaran realtime dan AI dikerjakan setelah respons terkirim.
  after(async () => {
    try {
      const msg = await getMessage(row.id);
      await Promise.all([
        sql`update conversation_members set last_read_at = now() where conversation_id = ${conversationId} and user_id = ${uid}`,
        broadcast(conversationId, "message", msg),
      ]);
    } catch {}

    const [conv] = await sql`select kind from conversations where id = ${conversationId}`;
    if (!(conv?.kind === "ai" || wantsAi)) return;

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
      values (${conversationId}, null, 'ai', ${answer}, ${row.id}) returning id`;
    await broadcast(conversationId, "message", await getMessage(r.id));
  });

  return Response.json({ id: row.id, created_at: row.created_at, mentions: row.mentions });
}

// Hapus pesan. scope=all: hapus untuk semua (hanya pengirim). scope=me: sembunyikan hanya untuk diri sendiri.
export async function DELETE(req: Request) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const id = uuid.safeParse(sp.get("id"));
  if (!id.success) return new Response("Bad request", { status: 400 });

  if (sp.get("scope") === "all") {
    // Pengirim boleh menghapus pesannya sendiri. Staf (admin/owner) boleh menghapus pesan milik role di bawahnya.
    const [row] = await sql`
      update messages set body = '', mentions = '{}', deleted_at = now()
      where id = ${id.data} and deleted_at is null
        and (sender_id = ${uid} or exists (
          select 1 from users v left join users s on s.id = messages.sender_id
          where v.id = ${uid} and v.role in ('admin', 'owner')
            and exists (select 1 from conversation_members where conversation_id = messages.conversation_id and user_id = v.id)
            and (case v.role when 'owner' then 2 else 1 end) > (case coalesce(s.role, 'user') when 'owner' then 2 when 'admin' then 1 else 0 end)))
      returning id, conversation_id, sender_id`;
    if (!row) return new Response("Not found", { status: 404 });
    if (row.sender_id !== uid) {
      const [who] = await sql`select coalesce(username, name) as n from users where id = ${uid}`;
      const [tg] = await sql`select coalesce(username, name) as n from users where id = ${row.sender_id}`;
      await logMod({ actorId: uid, actorName: String(who?.n ?? "Staf"), action: "delete_message", targetId: row.sender_id, targetName: tg?.n ?? "Kev-Ai" });
    }
    after(() => broadcast(row.conversation_id, "delete", { id: row.id, conversation_id: row.conversation_id }));
    return Response.json({ ok: true });
  }

  await sql`
    update messages m set hidden_by = array_append(m.hidden_by, ${uid})
    where m.id = ${id.data} and not (${uid} = any(m.hidden_by))
      and exists (select 1 from conversation_members where conversation_id = m.conversation_id and user_id = ${uid})`;
  return Response.json({ ok: true });
}
