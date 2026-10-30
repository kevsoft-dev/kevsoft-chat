import { sql } from "@/lib/db";
import { limit, tooMany } from "@/lib/ratelimit";
import { ID_UUID, MAX_BODY, aliasName, cleanText, deny, member, mentionsOf, onlineCount, open, out, purgeExpired, roomFor, seal, touchPresence } from "@/lib/ghosh";

export const dynamic = "force-dynamic";

// Pesan: pengirim hanya berupa nomor alias (Unknown{nomor}). Nama asli muncul HANYA jika pengirim sudah
// mengenalkan diri ke pemanggil lewat "Kenalkan diri" di chat pribadi.
export async function GET(req: Request) {
  const g = await member();
  if (!g) return deny();
  const sp = new URL(req.url).searchParams;
  const room = sp.get("room") ?? "";
  if (!ID_UUID.test(room)) return out({ error: "Bad request" }, 400);
  const rl = await limit(`ghpoll:${g.actor.id}`, 90, 60);
  if (!rl.ok) return tooMany(rl);
  const rm = await roomFor(room, g.tag);
  if (!rm) return deny();
  const after = Math.max(0, Number.parseInt(sp.get("after") ?? "0", 10) || 0);
  await purgeExpired();
  touchPresence(g.actor.id);
  const rows = after
    ? await sql`
        select m.id, m.body, m.sender, m.created_at, a.num, u.name as real_name, u.username as real_username
        from ghosh_messages m
        left join ghosh_alias a on a.tag = m.sender
        left join ghosh_reveals rv on rv.from_tag = m.sender and rv.to_tag = ${g.tag}
        left join users u on u.id = rv.from_user_id
        where m.room_id = ${room}::uuid and m.id > ${after} and (m.expires_at is null or m.expires_at > now()) order by m.id asc limit 100`
    : await sql`
        select * from (
          select m.id, m.body, m.sender, m.created_at, a.num, u.name as real_name, u.username as real_username
          from ghosh_messages m
          left join ghosh_alias a on a.tag = m.sender
          left join ghosh_reveals rv on rv.from_tag = m.sender and rv.to_tag = ${g.tag}
          left join users u on u.id = rv.from_user_id
          where m.room_id = ${room}::uuid and (m.expires_at is null or m.expires_at > now()) order by m.id desc limit 80) t
        order by id asc`;
  return out({
    locked: !!rm.locked, online: await onlineCount(), kind: rm.kind,
    messages: rows.map((m) => {
      const num = m.num ? Number(m.num) : 0;
      return {
        id: Number(m.id), body: open(String(m.body), room), at: new Date(m.created_at).toISOString(), mine: m.sender === g.tag,
        num, alias: num ? aliasName(num) : "Unknown", real: m.real_name || m.real_username || null, real_username: m.real_username || null,
      };
    }),
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
  const rm = await roomFor(room, g.tag);
  if (!rm) return deny();
  if (rm.kind === "group" && rm.locked && !g.root) return out({ error: "Room dikunci" }, 403);
  const ttl = rm.ttl_seconds ? Number(rm.ttl_seconds) : null;
  const [m] = await sql`
    insert into ghosh_messages (room_id, sender, body, expires_at, mentions)
    values (${room}::uuid, ${g.tag}, ${seal(body, room)}, ${ttl ? new Date(Date.now() + ttl * 1000).toISOString() : null}, ${mentionsOf(body)}::int[])
    returning id`;
  return out({ ok: true, id: Number(m.id) });
}
