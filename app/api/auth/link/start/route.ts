import { randomBytes } from "crypto";
import { sql } from "@/lib/db";
import { clientIp, limit, tooMany } from "@/lib/ratelimit";
import { describeUa, fmtCode, newCode, sha256, withDev } from "@/lib/devices";

// Perangkat BARU (belum login) meminta kode tautan. Kode tampil di layar,
// lalu disetujui dari perangkat yang sudah login. secret hanya dipegang perangkat peminta.
export async function POST(req: Request) {
  const ip = clientIp(req);
  const l = await limit(`linkstart:${ip}`, 10, 600);
  if (!l.ok) return tooMany(l, "Terlalu sering meminta kode. Tunggu beberapa menit.");
  const d = describeUa(req.headers.get("user-agent") ?? "");
  const secret = randomBytes(24).toString("base64url");
  const code = newCode();
  await withDev(() => sql`
    insert into link_requests (code, secret_hash, label, platform, ip, expires_at)
    values (${code}, ${sha256(secret)}, ${d.label}, ${d.platform}, ${ip}, now() + interval '3 minutes')`);
  sql`delete from link_requests where expires_at < now() - interval '1 hour'`.catch(() => {});
  return Response.json({ code: fmtCode(code), secret, expires_in: 180 });
}
