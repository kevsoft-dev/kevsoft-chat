import { randomBytes } from "crypto";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { limit, tooMany } from "@/lib/ratelimit";
import { MAX_KEYS, sha256, withDev } from "@/lib/devices";

// Key lengkap hanya ditampilkan SEKALI saat dibuat. Di database hanya tersimpan hash SHA-256-nya.
export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  const l = await limit(`keynew:${uid}`, 10, 3600);
  if (!l.ok) return tooMany(l);
  const b = await req.json().catch(() => null);
  const name = String(b?.name ?? "").trim().slice(0, 40);
  if (!name || /[\u0000-\u001f\u007f]/.test(name)) return Response.json({ error: "Beri nama key (maks. 40 karakter)." }, { status: 400 });
  const [u] = await withDev(() => sql`select dev_mode_at from users where id = ${uid}`);
  if (!u?.dev_mode_at) return Response.json({ error: "Aktifkan developer mode dulu." }, { status: 403 });
  const [n] = await sql`select count(*)::int as c from api_keys where user_id = ${uid} and revoked_at is null`;
  if (Number(n.c) >= MAX_KEYS) return Response.json({ error: `Maksimal ${MAX_KEYS} key aktif. Cabut salah satu dulu.` }, { status: 409 });
  const key = "kc_live_" + randomBytes(24).toString("base64url");
  const [k] = await sql`insert into api_keys (user_id, name, prefix, hash) values (${uid}, ${name}, ${key.slice(0, 12)}, ${sha256(key)}) returning id, created_at`;
  return Response.json({ id: String(k.id), name, prefix: key.slice(0, 12), key, created_at: new Date(k.created_at as string).toISOString() });
}
