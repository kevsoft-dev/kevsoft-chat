import { createHash } from "crypto";
import { sql } from "./db";
import { ensureSchema } from "./migrate";

// Akun diidentifikasi lewat email (Google dan OTP email = akun yang sama).
export async function upsertUserByEmail(email: string, name?: string, avatar?: string) {
  await ensureSchema();
  const id = "u_" + createHash("sha256").update(email).digest("hex").slice(0, 32);
  const display = name || email.split("@")[0];
  const [u] = await sql`
    insert into users (id, email, name, avatar_url) values (${id}, ${email}, ${display}, ${avatar ?? null})
    on conflict (email) do update set avatar_url = coalesce(users.avatar_url, excluded.avatar_url)
    returning id`;
  return u.id as string;
}
