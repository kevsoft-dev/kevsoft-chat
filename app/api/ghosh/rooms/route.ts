import { sql } from "@/lib/db";
import { aliasName, deny, member, out, purgeExpired } from "@/lib/ghosh";

export const dynamic = "force-dynamic";

// Daftar room grup + chat pribadi milik pemanggil. Chat pribadi orang lain tidak pernah muncul (owner pun tidak).
export async function GET() {
  const g = await member();
  if (!g) return deny();
  await purgeExpired();
  const groups = await sql`
    select r.id, r.name, r.topic, r.locked, r.ttl_seconds,
      (select max(m.id) from ghosh_messages m where m.room_id = r.id and (m.expires_at is null or m.expires_at > now())) as last_id,
      (select max(m.id) from ghosh_messages m where m.room_id = r.id and ${g.num}::int = any(m.mentions) and m.sender <> ${g.tag}
         and (m.expires_at is null or m.expires_at > now())) as last_mention_id
    from ghosh_rooms r where r.kind = 'group' order by r.created_at asc`;
  const dms = await sql`
    select r.id, r.ttl_seconds, a.num as other_num, ot.tag as other_tag,
      (select max(m.id) from ghosh_messages m where m.room_id = r.id and (m.expires_at is null or m.expires_at > now())) as last_id,
      (select u.name from ghosh_reveals rv join users u on u.id = rv.from_user_id where rv.from_tag = ot.tag and rv.to_tag = ${g.tag}) as real_name,
      (select u.username from ghosh_reveals rv join users u on u.id = rv.from_user_id where rv.from_tag = ot.tag and rv.to_tag = ${g.tag}) as real_username,
      exists (select 1 from ghosh_reveals rv where rv.from_tag = ${g.tag} and rv.to_tag = ot.tag) as revealed_by_me
    from ghosh_rooms r
    cross join lateral (select case when r.a_tag = ${g.tag} then r.b_tag else r.a_tag end as tag) ot
    join ghosh_alias a on a.tag = ot.tag
    where r.kind = 'dm' and (r.a_tag = ${g.tag} or r.b_tag = ${g.tag})
    order by coalesce((select max(m.id) from ghosh_messages m where m.room_id = r.id), 0) desc`;
  return out({
    me: { num: g.num, alias: aliasName(g.num) },
    rooms: groups.map((r) => ({ id: r.id, name: r.name, topic: r.topic, locked: r.locked, ttl: r.ttl_seconds, last_id: r.last_id ? Number(r.last_id) : 0, last_mention_id: r.last_mention_id ? Number(r.last_mention_id) : 0 })),
    dms: dms.map((r) => ({
      id: r.id, num: Number(r.other_num), alias: aliasName(Number(r.other_num)), ttl: r.ttl_seconds,
      real: r.real_name || r.real_username || null, real_username: r.real_username || null,
      revealed_by_me: !!r.revealed_by_me, last_id: r.last_id ? Number(r.last_id) : 0,
    })),
  });
}
