import { sql } from "@/lib/db";
import { member, out, deny, purgeExpired } from "@/lib/ghosh";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await member();
  if (!g) return deny();
  await purgeExpired();
  const rows = await sql`
    select r.id, r.name, r.topic, r.locked, r.ttl_seconds,
      (select max(m.id) from ghosh_messages m where m.room_id = r.id and (m.expires_at is null or m.expires_at > now())) as last_id
    from ghosh_rooms r order by r.created_at asc`;
  return out({ rooms: rows.map((r) => ({ id: r.id, name: r.name, topic: r.topic, locked: r.locked, ttl: r.ttl_seconds, last_id: r.last_id ? Number(r.last_id) : 0 })) });
}
