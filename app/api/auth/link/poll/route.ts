import { sql } from "@/lib/db";
import { clientIp, limit, tooMany } from "@/lib/ratelimit";
import { normCode, sha256, withDev } from "@/lib/devices";
import { startSession } from "@/lib/session";

// Perangkat baru menanyakan apakah kodenya sudah disetujui. Begitu disetujui, sesi dibuat SEKALI saja.
export async function POST(req: Request) {
  const l = await limit(`linkpoll:${clientIp(req)}`, 200, 300);
  if (!l.ok) return tooMany(l);
  const b = await req.json().catch(() => null);
  const code = normCode(b?.code);
  const secret = String(b?.secret ?? "").slice(0, 100);
  if (code.length !== 8 || !secret) return Response.json({ status: "gone" });
  const [r] = await withDev(() => sql`
    select approved_at, claimed_at, (expires_at > now()) as live from link_requests
    where code = ${code} and secret_hash = ${sha256(secret)}`);
  if (!r || r.claimed_at) return Response.json({ status: "gone" });
  if (!r.live) return Response.json({ status: "expired" });
  if (!r.approved_at) return Response.json({ status: "pending" });
  const [c] = await sql`
    update link_requests set claimed_at = now()
    where code = ${code} and claimed_at is null and approved_at is not null and user_id is not null
    returning user_id, label, platform, ip`;
  if (!c) return Response.json({ status: "gone" });
  await startSession(String(c.user_id), undefined, { linked: true, label: String(c.label ?? ""), platform: String(c.platform ?? ""), ip: String(c.ip ?? "") });
  return Response.json({ status: "ok" });
}
