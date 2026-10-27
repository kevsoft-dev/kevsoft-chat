import { sql } from "./db";
import { pusher } from "./pusher";

// Pesan lengkap dengan username pengirim dan kutipan balasan.
export async function getMessage(id: string) {
  const [m] = await sql`
    select m.id, m.conversation_id, m.sender_id, m.kind,
      case when m.deleted_at is null then m.body else '' end as body,
      m.created_at, m.deleted_at, m.reply_to, m.mentions,
      case when m.kind = 'ai' then 'kev-ai' else u.username end as username,
      case when m.kind = 'ai' then 'Kev-Ai' else coalesce(u.name, u.username) end as name,
      u.avatar_url,
      case when r.id is null then null when r.deleted_at is not null then '' else left(r.body, 140) end as reply_body,
      case when r.kind = 'ai' then 'kev-ai' else ru.username end as reply_username
    from messages m
    left join users u on u.id = m.sender_id
    left join messages r on r.id = m.reply_to
    left join users ru on ru.id = r.sender_id
    where m.id = ${id}`;
  return m;
}

// Kirim event realtime ke semua anggota percakapan (Pusher maks 100 channel per panggilan).
export async function broadcast(conversationId: string, event: string, payload: unknown) {
  try {
    const members = await sql`select user_id from conversation_members where conversation_id = ${conversationId}`;
    const channels = members.map((m) => `private-user-${m.user_id}`);
    for (let i = 0; i < channels.length; i += 100)
      await pusher.trigger(channels.slice(i, i + 100), event, payload);
  } catch {}
}

// Event hanya ke satu user (mis. sinkron perangkat lain milik user yang sama).
export async function pushTo(userId: string, event: string, payload: unknown) {
  try { await pusher.trigger(`private-user-${userId}`, event, payload); } catch {}
}
