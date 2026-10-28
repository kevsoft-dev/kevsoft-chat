import { clientIp, limit, tooMany } from "@/lib/ratelimit";
import { timingSafeEqual } from "crypto";
import { z } from "zod";
import { startSession } from "@/lib/session";
import { banNotice, upsertUserByEmail } from "@/lib/users";
import { sql } from "@/lib/db";
import { hashOtp } from "@/lib/otp";

const schema = z.object({ email: z.string().email().max(254), code: z.string().regex(/^\d{6}$/) });
const bad = () => Response.json({ error: "Kode salah atau sudah kedaluwarsa" }, { status: 400 });

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad();
  const email = parsed.data.email.toLowerCase();
  const rl = await limit(`otpv:ip:${clientIp(req)}`, 30, 900);
  if (!rl.ok) return tooMany(rl);

  // Naikkan jumlah percobaan secara atomik; maksimal 5.
  const [row] = await sql`
    update otp_codes set attempts = attempts + 1
    where email = ${email} and attempts < 5 returning *`;
  if (!row || new Date(row.expires_at) < new Date()) return bad();

  const a = Buffer.from(hashOtp(email, parsed.data.code));
  const b = Buffer.from(row.code_hash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return bad();

  await sql`delete from otp_codes where email = ${email}`; // sekali pakai

  const uid = await upsertUserByEmail(email);
  const ban = await banNotice(uid);
  if (ban) return Response.json({ error: ban }, { status: 403 });
  await startSession(uid, "otp");
  return Response.json({ ok: true });
}
