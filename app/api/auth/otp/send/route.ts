import { randomInt } from "crypto";
import { z } from "zod";
import { sql } from "@/lib/db";
import { hashOtp } from "@/lib/otp";
import { ensureSchema } from "@/lib/migrate";

const schema = z.object({ email: z.string().email().max(254) });

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Email tidak valid" }, { status: 400 });
  const email = parsed.data.email.toLowerCase();
  await ensureSchema();

  // Batas kirim ulang: 1x per 60 detik per email (tambahkan rate limit per IP di produksi).
  const [prev] = await sql`select sent_at from otp_codes where email = ${email}`;
  if (prev && Date.now() - new Date(prev.sent_at).getTime() < 60_000)
    return Response.json({ error: "Tunggu 1 menit sebelum meminta kode lagi" }, { status: 429 });

  const otp = String(randomInt(100000, 1000000));
  await sql`
    insert into otp_codes (email, code_hash, expires_at, attempts, sent_at)
    values (${email}, ${hashOtp(email, otp)}, now() + interval '5 minutes', 0, now())
    on conflict (email) do update
      set code_hash = excluded.code_hash, expires_at = excluded.expires_at,
          attempts = 0, sent_at = now()`;

  try {
    const r = await fetch("https://api-email-otp-lovat.vercel.app/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: email,
        app: "kevsoft-chat",
        otp,
        logo: "https://github.com/kevsoft-dev.png",
      }),
    });
    if (!r.ok) throw new Error(String(r.status));
  } catch {
    return Response.json({ error: "Gagal mengirim email. Coba lagi." }, { status: 502 });
  }
  return Response.json({ ok: true }); // OTP tidak pernah dikembalikan ke client
}
