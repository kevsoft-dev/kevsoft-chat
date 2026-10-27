import { sql } from "./db";
import { ensureSchema } from "./migrate";
import { isRootEmail, userIdForEmail } from "./roles";

// Akun diidentifikasi lewat email (Google dan OTP email = akun yang sama).
// Email owner utama (config.json -> owners) otomatis menjadi role owner.
export async function upsertUserByEmail(email: string, name?: string, avatar?: string) {
  await ensureSchema();
  const id = userIdForEmail(email);
  const display = name || email.split("@")[0];
  const root = isRootEmail(email);
  const [u] = await sql`
    insert into users (id, email, name, avatar_url, role) values (${id}, ${email}, ${display}, ${avatar ?? null}, ${root ? "owner" : "user"})
    on conflict (email) do update set
      avatar_url = coalesce(users.avatar_url, excluded.avatar_url),
      role = case when ${root} then 'owner' else users.role end
    returning id`;
  return u.id as string;
}

// Kembalikan pesan penolakan kalau akun diblokir, atau null kalau aman.
export async function banNotice(uid: string): Promise<string | null> {
  const [b] = await sql`select banned_at, ban_reason from users where id = ${uid}`;
  if (!b?.banned_at) return null;
  return "Akun ini diblokir" + (b.ban_reason ? `: ${String(b.ban_reason).slice(0, 200)}` : ".");
}

// Hitung percobaan login/ganti password yang gagal; 5x gagal = kunci 10 menit.
export async function registerFail(uid: string) {
  await sql`
    update users set
      login_fails = case when login_fails + 1 >= 5 then 0 else login_fails + 1 end,
      locked_until = case when login_fails + 1 >= 5 then now() + interval '10 minutes' else locked_until end
    where id = ${uid}`;
}
