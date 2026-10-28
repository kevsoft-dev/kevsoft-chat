import { clientIp, limit, tooMany } from "@/lib/ratelimit";
import { z } from "zod";
import { sql } from "@/lib/db";
import { forgetAuth, getUserId } from "@/lib/auth";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/password";
import { readSessionMeta, startSession } from "@/lib/session";
import { isFresh } from "@/lib/token";
import { registerFail } from "@/lib/users";

const schema = z.object({ password: z.string().max(128), current: z.string().max(128).optional() });

// Buat / ganti password. Boleh kalau: belum punya password (baru verifikasi),
// atau password lama benar, atau baru saja verifikasi email/Google (lupa password).
export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  const rl = await limit(`pw:${uid}`, 10, 900);
  if (!rl.ok) return tooMany(rl);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Data tidak valid" }, { status: 400 });

  const [u] = await sql`select username, password_hash, locked_until from users where id = ${uid}`;
  if (!u) return new Response("Unauthorized", { status: 401 });
  const pwErr = passwordProblem(parsed.data.password, u.username);
  if (pwErr) return Response.json({ error: pwErr }, { status: 400 });

  let allowed = !u.password_hash || isFresh(await readSessionMeta());
  if (!allowed) {
    if (u.locked_until && new Date(u.locked_until) > new Date())
      return Response.json({ error: "Terlalu banyak percobaan. Coba lagi beberapa menit lagi." }, { status: 429 });
    if (!parsed.data.current) return Response.json({ error: "Masukkan password lama" }, { status: 400 });
    allowed = await verifyPassword(parsed.data.current, u.password_hash);
    if (!allowed) { await registerFail(uid); return Response.json({ error: "Password lama salah" }, { status: 400 }); }
  }

  const hash = await hashPassword(parsed.data.password);
  // token_version dinaikkan: semua sesi lama (perangkat lain) dicabut; perangkat ini langsung diberi sesi baru.
  await sql`update users set password_hash = ${hash}, login_fails = 0, locked_until = null, token_version = token_version + 1 where id = ${uid}`;
  forgetAuth(uid);
  await startSession(uid);
  return Response.json({ ok: true });
}
