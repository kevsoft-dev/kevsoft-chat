import { sql } from "@/lib/db";
import { limit, tooMany } from "@/lib/ratelimit";
import { ID_UUID, MAX_BODY, cleanText, deny, member, onlineCount, open, out, purgeExpired, seal, senderTag, touchPresence } from "@/lib/ghosh";

export const dynamic = "force-dynamic";

// Pesan: setiap field identitas SENGAJA tidak ada. Hanya id, isi, waktu, dan penanda "mine" untuk pemanggil.
export async function GET(req: Request) {
  const g = await member();
  if (!g) return deny();
  const sp = new URL(req.url).searchParams;
  const room = sp.get("room") ?? "";
  if (!ID_UUID.test(room)) return out({ error: "Bad request" }, 400);
  const rl = await limit(`ghpoll:${g.actor.id}`, 90, 60);
  if (!rl.ok) return tooMany(rl);
  const after = Math.max(0, Number.parseInt(sp.get("after") ?? "0", 10) || 0);
  await purgeExpired();
  touchPresence(g.actor.id);
  const me = senderTag(g.actor.id);
  const rows = after
    ? await sql`select id, body, sender, created_at from ghosh_messages
        where room_id = ${room}::uuid and id > ${after} and (expires_at is null or expires_at > now()) order by id asc limit 100`
    : await sql`select * from (select id, body, sender, created_at from ghosh_messages
        where room_id = ${room}::uuid and (expires_at is null or expires_at > now()) order by id desc limit 80) t order by id asc`;
  const [rm] = await sql`select locked from ghosh_rooms where id = ${room}::uuid`;
  if (!rm) return deny();
  return out({
    locked: !!rm.locked, online: await onlineCount(),
    messages: rows.map((m) => ({ id: Number(m.id), body: open(String(m.body), room), at: new Date(m.created_at).toISOString(), mine: m.sender === me })),
  });
}

export async function POST(req: Request) {
  const g = await member();
  if (!g) return deny();
  const rl = await limit(`ghsend:${g.actor.id}`, 25, 60);
  if (!rl.ok) return tooMany(rl, "Pelan-pelan.");
  const b = (await req.json().catch(() => null)) as { room?: string; body?: string } | null;
  const room = String(b?.room ?? "");
  const body = cleanText(b?.body, MAX_BODY);
  if (!ID_UUID.test(room) || !body) return out({ error: "Bad request" }, 400);
  const [rm] = await sql`select locked, ttl_seconds from ghosh_rooms where id = ${room}::uuid`;
  if (!rm) return deny();
  if (rm.locked && !g.root) return out({ error: "Room dikunci" }, 403);
  const ttl = rm.ttl_seconds ? Number(rm.ttl_seconds) : null;
  const [m] = await sql`
    insert into ghosh_messages (room_id, sender, body, expires_at)
    values (${room}::uuid, ${senderTag(g.actor.id)}, ${seal(body, room)}, ${ttl ? new Date(Date.now() + ttl * 1000).toISOString() : null})
    returning id`;
  return out({ ok: true, id: Number(m.id) });
}
