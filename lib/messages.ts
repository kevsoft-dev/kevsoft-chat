import { sql } from "./db";
import { pusher } from "./pusher";

// Pesan lengkap dengan username pengirim, media, pin, poll, dan kutipan balasan.
export async function getMessage(id: string) {
  const [m] = await sql`
    select m.id, m.conversation_id, m.sender_id, m.kind,
      case when m.deleted_at is null then m.body else '' end as body,
      m.created_at, m.deleted_at, m.reply_to, m.mentions,
      m.pinned_at, m.media_mime, m.media_name,
      case when m.media_data is not null and m.deleted_at is null then true else false end as has_media,
      m.poll_data,
      coalesce((
        select jsonb_agg(jsonb_build_object('e', x.emoji, 'u', x.users) order by x.first_at)
        from (
          select r.emoji, min(r.created_at) as first_at,
            jsonb_agg(jsonb_build_object('u', ru2.username, 'n', coalesce(ru2.name, ru2.username)) order by r.created_at) as users
          from message_reactions r join users ru2 on ru2.id = r.user_id
          where r.message_id = m.id group by r.emoji
        ) x
      ), '[]'::jsonb) as reactions,
      case when m.kind = 'ai' then 'kev-ai' else u.username end as username,
      case when m.kind = 'ai' then 'Kev-Ai' else coalesce(u.name, u.username) end as name,
      u.avatar_url,
      coalesce(u.role = 'owner' or u.verified, false) as verified,
      case when r.id is null then null when r.deleted_at is not null then '' else left(r.body, 140) end as reply_body,
      case when r.kind = 'ai' then 'kev-ai' else ru.username end as reply_username
    from messages m
    left join users u on u.id = m.sender_id
    left join messages r on r.id = m.reply_to
    left join users ru on ru.id = r.sender_id
    where m.id = ${id}`;
  return m;
}

export async function broadcast(conversationId: string, event: string, payload: unknown) {
  try {
    const members = await sql`select user_id from conversation_members where conversation_id = ${conversationId}`;
    const channels = members.map((m) => `private-user-${m.user_id}`);
    for (let i = 0; i < channels.length; i += 100)
      await pusher.trigger(channels.slice(i, i + 100), event, payload);
  } catch {}
}

export async function pushTo(userId: string, event: string, payload: unknown) {
  try { await pusher.trigger(`private-user-${userId}`, event, payload); } catch {}
}

// Ringkasan reaksi satu pesan: [{ e: emoji, u: [{ u: username, n: nama }] }], urut dari yang pertama muncul.
export async function getReactions(id: string) {
  const [r] = await sql`
    select coalesce((
      select jsonb_agg(jsonb_build_object('e', x.emoji, 'u', x.users) order by x.first_at)
      from (
        select r.emoji, min(r.created_at) as first_at,
          jsonb_agg(jsonb_build_object('u', u.username, 'n', coalesce(u.name, u.username)) order by r.created_at) as users
        from message_reactions r join users u on u.id = r.user_id
        where r.message_id = ${id} group by r.emoji
      ) x
    ), '[]'::jsonb) as reactions`;
  return r.reactions as { e: string; u: { u: string; n: string }[] }[];
}
