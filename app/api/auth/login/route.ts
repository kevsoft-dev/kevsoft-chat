import { z } from "zod";
import { sql } from "@/lib/db";
import { ensureSchema } from "@/lib/migrate";
import { verifyPassword } from "@/lib/password";
import { startSession } from "@/lib/session";
import { registerFail } from "@/lib/users";

const schema = z.object({ username: z.string().trim().toLowerCase().min(3).max(20), password: z.string().min(1).max(128) });
const bad = () => Response.json({ error: "Username atau password salah" }, { status: 401 });

// Login cepat: username + password (password dibuat setelah verifikasi email/Google pertama).
export async function POST(req: Request) {
  const p = schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return bad();
  await ensureSchema();

  const [u] = await sql`
    select id, password_hash, banned_at, ban_reason, locked_until from users where lower(username) = ${p.data.username}`;

  if (u?.locked_until && new Date(u.locked_until) > new Date())
    return Response.json({ error: "Terlalu banyak percobaan. Coba lagi beberapa menit lagi." }, { status: 429 });

  const ok = await verifyPassword(p.data.password, u?.password_hash ?? null);
  if (!u || !ok) {
    if (u) await registerFail(u.id);
    return bad();
  }
  if (u.banned_at)
    return Response.json({ error: "Akun ini diblokir" + (u.ban_reason ? `: ${String(u.ban_reason).slice(0, 200)}` : ".") }, { status: 403 });

  await sql`update users set login_fails = 0, locked_until = null where id = ${u.id}`;
  await startSession(u.id);
  return Response.json({ ok: true });
}
