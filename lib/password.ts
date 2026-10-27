import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "crypto";

// Password di-hash dengan scrypt + salt acak per user. Format: scrypt$N$r$p$salt$hash (base64).
const N = 16384, R = 8, P = 1, KEYLEN = 32;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

const derive = (pw: string, salt: Buffer, n: number, r: number, p: number) =>
  new Promise<Buffer>((res, rej) => {
    const opts: ScryptOptions = { N: n, r, p, maxmem: 64 * 1024 * 1024 };
    scryptCb(pw.normalize("NFKC"), salt, KEYLEN, opts, (e, k) => (e ? rej(e) : res(k as Buffer)));
  });

export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const key = await derive(pw, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

let dummy: Promise<string> | null = null;

// Tanpa hash tersimpan tetap menghitung hash palsu supaya waktu respons sama (anti tebak username).
export async function verifyPassword(pw: string, stored?: string | null) {
  const hash = stored ?? (await (dummy ??= hashPassword("dummy-password-for-timing")));
  const [scheme, n, r, p, salt, key] = hash.split("$");
  if (scheme !== "scrypt" || !salt || !key) return false;
  try {
    const expected = Buffer.from(key, "base64");
    const got = await derive(pw, Buffer.from(salt, "base64"), Number(n), Number(r), Number(p));
    return stored != null && got.length === expected.length && timingSafeEqual(got, expected);
  } catch {
    return false;
  }
}

export function passwordProblem(pw: string, username?: string | null): string | null {
  if (pw.length < PASSWORD_MIN) return `Password minimal ${PASSWORD_MIN} karakter`;
  if (pw.length > PASSWORD_MAX) return `Password maksimal ${PASSWORD_MAX} karakter`;
  if (!pw.trim()) return "Password tidak boleh kosong";
  if (username && pw.toLowerCase() === username.toLowerCase()) return "Password tidak boleh sama dengan username";
  return null;
}
