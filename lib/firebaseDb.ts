import { randomBytes } from "crypto";
import { SignJWT, importPKCS8 } from "jose";
import { cfg } from "./config";

// Klien REST Firebase Realtime Database, hanya dipakai dari server.
// Browser TIDAK pernah menyentuh database ini langsung: semua lewat API kita (yang mengecek login & role).
// Di Firebase Console > Realtime Database > Rules, set: { "rules": { ".read": false, ".write": false } }
// (kredensial server tetap bisa baca/tulis, orang luar tidak bisa).

export class DbNotConfigured extends Error {}

let cached: { token: string; exp: number } | null = null;

async function accessToken(): Promise<{ param: string; value: string }> {
  if (cfg.firebaseDb.serviceAccount) {
    if (cached && cached.exp > Date.now() + 60_000) return { param: "access_token", value: cached.token };
    let sa: { client_email: string; private_key: string };
    try { sa = JSON.parse(cfg.firebaseDb.serviceAccount); } catch { throw new DbNotConfigured("FIREBASE_SERVICE_ACCOUNT bukan JSON valid"); }
    const key = await importPKCS8(String(sa.private_key).replace(/\\n/g, "\n"), "RS256");
    const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email" })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(sa.client_email).setSubject(sa.client_email)
      .setAudience("https://oauth2.googleapis.com/token")
      .setIssuedAt().setExpirationTime("1h").sign(key);
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error("Gagal mendapatkan token Firebase");
    const d = await r.json();
    cached = { token: d.access_token, exp: Date.now() + Number(d.expires_in ?? 3600) * 1000 };
    return { param: "access_token", value: cached.token };
  }
  if (cfg.firebaseDb.secret) return { param: "auth", value: cfg.firebaseDb.secret };
  throw new DbNotConfigured("Firebase Database belum dikonfigurasi (isi FIREBASE_SERVICE_ACCOUNT atau FIREBASE_DB_SECRET)");
}

export type DbRes = { status: number; data: any };

export async function db(method: "GET" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown, query: Record<string, string> = {}, headers: Record<string, string> = {}): Promise<DbRes> {
  const a = await accessToken();
  const qs = new URLSearchParams({ ...query, [a.param]: a.value });
  const r = await fetch(`${cfg.firebaseDb.url}/${path}.json?${qs}`, {
    method,
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok && r.status !== 412) throw new Error(`Firebase ${r.status}`);
  const data = r.status === 204 ? null : await r.json().catch(() => null);
  return { status: r.status, data };
}

// Nilai server-side: tambah/kurangi counter secara atomik tanpa race.
export const inc = (n: number) => ({ ".sv": { increment: n } });

// ID berurutan waktu (aman sebagai key Firebase, bisa diurutkan dengan orderBy="$key").
export const newId = () => Date.now().toString(36).padStart(9, "0") + randomBytes(4).toString("hex");
export const ID_RE = /^[0-9a-z]{9,32}$/;

export const dbError = (e: unknown) =>
  Response.json({ error: e instanceof DbNotConfigured ? e.message : "Database berita sedang bermasalah. Coba lagi nanti." }, { status: e instanceof DbNotConfigured ? 503 : 502 });
