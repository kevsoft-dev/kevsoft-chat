import { sql } from "@/lib/db";
import { limit, tooMany } from "@/lib/ratelimit";
import { EMAIL_RE, ID_UUID, MAX_ROOMS, audit, cleanText, deny, normEmail, onlineCount, out, rootOnly, setSetting, setting } from "@/lib/ghosh";
import { isRootEmail } from "@/lib/roles";

export const dynamic = "force-dynamic";

// Seluruh pengelolaan ruang. HANYA owner utama (kevsoft.cs@gmail.com); selain itu dijawab 404 samar.
export async function GET() {
  const g = await rootOnly();
  if (!g) return deny();
  const [access, rooms, logs, st] = await Promise.all([
    sql`select email, status, note, requested_at, decided_at, decided_by from ghosh_access order by (status = 'pending') desc, requested_at desc limit 500`,
    sql`select r.id, r.name, r.topic, r.locked, r.ttl_seconds, r.created_at,
          (select count(*)::int from ghosh_messages m where m.room_id = r.id and (m.expires_at is null or m.expires_at > now())) as messages
        from ghosh_rooms r where r.kind = 'group' order by r.created_at asc`,
    sql`select id, actor, action, target, detail, at from ghosh_audit order by id desc limit 150`,
    sql`select (select count(*)::int from ghosh_messages where expires_at is null or expires_at > now()) as messages,
               (select count(*)::int from ghosh_messages where created_at > now() - interval '24 hours') as messages_24h`,
  ]);
  const count = (s: string) => access.filter((a) => a.status === s).length;
  return out({
    me: g.email,
    lockdown: (await setting("lockdown")) === "1",
    online: await onlineCount(),
    stats: { pending: count("pending"), approved: count("approved"), rejected: count("rejected"), revoked: count("revoked"), rooms: rooms.length, messages: st[0].messages, messages_24h: st[0].messages_24h },
    access: access.map((a) => ({ email: a.email, status: a.status, note: a.note, requested_at: a.requested_at, decided_at: a.decided_at })),
    rooms: rooms.map((r) => ({ id: r.id, name: r.name, topic: r.topic, locked: r.locked, ttl: r.ttl_seconds, created_at: r.created_at, messages: r.messages })),
    logs: logs.map((l) => ({ id: Number(l.id), actor: l.actor, action: l.action, target: l.target, detail: l.detail, at: l.at })),
  });
}

const TTLS = new Set([0, 60, 3600, 86400, 604800]); // 0 = permanen

export async function POST(req: Request) {
  const g = await rootOnly();
  if (!g) return deny();
  const rl = await limit(`ghadm:${g.actor.id}`, 120, 60);
  if (!rl.ok) return tooMany(rl);
  const b = (await req.json().catch(() => null)) as Record<string, any> | null;
  if (!b || typeof b.action !== "string") return out({ error: "Bad request" }, 400);
  const who = g.email;
  const bad = (m: string) => out({ error: m }, 400);

  switch (b.action) {
    case "approve": case "reject": case "revoke": case "remove": {
      const email = normEmail(b.email);
      if (!EMAIL_RE.test(email) || isRootEmail(email)) return bad("Email tidak valid");
      if (b.action === "remove") await sql`delete from ghosh_access where email = ${email}`;
      else {
        const st = b.action === "approve" ? "approved" : b.action === "reject" ? "rejected" : "revoked";
        await sql`update ghosh_access set status = ${st}, decided_at = now(), decided_by = ${who} where email = ${email}`;
      }
      await audit(who, b.action, email);
      return out({ ok: true });
    }
    case "add": { // izinkan email langsung (pra-ACC), meski belum pernah mendaftar
      const email = normEmail(b.email);
      if (!EMAIL_RE.test(email)) return bad("Email tidak valid");
      if (isRootEmail(email)) return bad("Owner utama selalu punya akses");
      const note = cleanText(b.note, 140) || null;
      await sql`
        insert into ghosh_access (email, status, note, decided_at, decided_by) values (${email}, 'approved', ${note}, now(), ${who})
        on conflict (email) do update set status = 'approved', decided_at = now(), decided_by = ${who}, note = coalesce(${note}, ghosh_access.note)`;
      await audit(who, "add", email, note);
      return out({ ok: true });
    }
    case "room_create": {
      const name = cleanText(b.name, 32).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
      if (name.length < 2) return bad("Nama room minimal 2 karakter (a-z, 0-9, -, _)");
      const ttl = Number(b.ttl ?? 0);
      if (!TTLS.has(ttl)) return bad("TTL tidak valid");
      const [{ n }] = await sql`select count(*)::int as n from ghosh_rooms where kind = 'group'`;
      if (n >= MAX_ROOMS) return bad(`Maksimal ${MAX_ROOMS} room`);
      const [r] = await sql`insert into ghosh_rooms (name, topic, ttl_seconds) values (${name}, ${cleanText(b.topic, 80) || null}, ${ttl || null}) returning id`;
      await audit(who, "room_create", name);
      return out({ ok: true, id: r.id });
    }
    case "room_update": {
      if (!ID_UUID.test(String(b.id))) return bad("ID tidak valid");
      if (b.ttl !== undefined && !TTLS.has(Number(b.ttl))) return bad("TTL tidak valid");
      if (b.locked !== undefined) await sql`update ghosh_rooms set locked = ${!!b.locked} where id = ${b.id}::uuid and kind = 'group'`;
      if (b.ttl !== undefined) await sql`update ghosh_rooms set ttl_seconds = ${Number(b.ttl) || null} where id = ${b.id}::uuid and kind = 'group'`;
      if (b.topic !== undefined) await sql`update ghosh_rooms set topic = ${cleanText(b.topic, 80) || null} where id = ${b.id}::uuid and kind = 'group'`;
      await audit(who, "room_update", String(b.id), JSON.stringify({ locked: b.locked, ttl: b.ttl, topic: b.topic !== undefined }));
      return out({ ok: true });
    }
    case "room_purge": case "room_delete": {
      if (!ID_UUID.test(String(b.id))) return bad("ID tidak valid");
      if (b.action === "room_purge") await sql`delete from ghosh_messages where room_id = ${b.id}::uuid and exists (select 1 from ghosh_rooms where id = ${b.id}::uuid and kind = 'group')`;
      else await sql`delete from ghosh_rooms where id = ${b.id}::uuid and kind = 'group'`;
      await audit(who, b.action, String(b.id));
      return out({ ok: true });
    }
    case "message_delete": {
      const id = Number(b.id);
      if (!Number.isInteger(id) || id < 1) return bad("ID tidak valid");
      await sql`delete from ghosh_messages where id = ${id}`;
      await audit(who, "message_delete", String(id));
      return out({ ok: true });
    }
    case "lockdown": {
      await setSetting("lockdown", b.on ? "1" : "0");
      await audit(who, b.on ? "lockdown_on" : "lockdown_off");
      return out({ ok: true });
    }
    case "wipe_all": {
      if (b.confirm !== "WIPE") return bad("Konfirmasi salah");
      await sql`delete from ghosh_messages`;
      await audit(who, "wipe_all");
      return out({ ok: true });
    }
    case "clear_logs": {
      await sql`delete from ghosh_audit`;
      await audit(who, "clear_logs");
      return out({ ok: true });
    }
  }
  return bad("Aksi tidak dikenal");
}
