import { sql } from "./db";
import { ensureSchema } from "./migrate";

// Rate limit berbasis database (tahan serverless: tidak bergantung memori satu instance).
// Satu query atomik per pengecekan. Jendela tetap (fixed window).
export type Limit = { ok: boolean; retry: number };

export function clientIp(req: Request): string {
  const h = req.headers;
  const raw = h.get("x-vercel-forwarded-for") || h.get("x-real-ip") || (h.get("x-forwarded-for") ?? "").split(",")[0] || "";
  const ip = raw.trim().slice(0, 64);
  return /^[0-9a-fA-F:.]+$/.test(ip) ? ip : "unknown";
}

export async function limit(key: string, max: number, windowSec: number): Promise<Limit> {
  const run = () => sql`
    insert into rate_limits (key, count, reset_at) values (${key}, 1, now() + make_interval(secs => ${windowSec}))
    on conflict (key) do update set
      count = case when rate_limits.reset_at <= now() then 1 else rate_limits.count + 1 end,
      reset_at = case when rate_limits.reset_at <= now() then now() + make_interval(secs => ${windowSec}) else rate_limits.reset_at end
    returning count, greatest(1, ceil(extract(epoch from (reset_at - now()))))::int as retry`;
  let rows: any[];
  try { rows = await run(); } catch { await ensureSchema(); rows = await run(); }
  // Pembersihan murah dan acak supaya tabel tidak menumpuk.
  if (Math.random() < 0.01) sql`delete from rate_limits where reset_at < now() - interval '1 hour'`.catch(() => {});
  return { ok: Number(rows[0].count) <= max, retry: Number(rows[0].retry) };
}

export const tooMany = (l: Limit, msg = "Terlalu banyak permintaan. Coba lagi sebentar lagi.") =>
  Response.json({ error: msg }, { status: 429, headers: { "Retry-After": String(l.retry) } });
