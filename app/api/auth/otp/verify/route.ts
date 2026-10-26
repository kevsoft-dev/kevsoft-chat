import { timingSafeEqual } from "crypto";
import { z } from "zod";
import { clerk } from "@/lib/clerk";
import { sql } from "@/lib/db";
import { hashOtp } from "@/lib/otp";

const schema = z.object({ email: z.string().email().max(254), code: z.string().regex(/^\d{6}$/) });
const bad = () => Response.json({ error: "Kode salah atau sudah kedaluwarsa" }, { status: 400 });

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad();
  const email = parsed.data.email.toLowerCase();

  // Naikkan jumlah percobaan secara atomik; maksimal 5.
  const [row] = await sql`
    update otp_codes set attempts = attempts + 1
    where email = ${email} and attempts < 5 returning *`;
  if (!row || new Date(row.expires_at) < new Date()) return bad();

  const a = Buffer.from(hashOtp(email, parsed.data.code));
  const b = Buffer.from(row.code_hash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return bad();

  await sql`delete from otp_codes where email = ${email}`; // sekali pakai

  const found = await clerk.users.getUserList({ emailAddress: [email] });
  const user =
    found.data[0] ?? (await clerk.users.createUser({ emailAddress: [email], skipPasswordRequirement: true }));

  const t = await clerk.signInTokens.createSignInToken({ userId: user.id, expiresInSeconds: 60 });
  return Response.json({ ticket: t.token });
}
