import { createHash, randomBytes } from "crypto";
import { sql } from "./db";

// Perangkat tertaut, developer mode, dan API key developer.
// Tabel dibuat sendiri (idempotent) supaya tidak mengubah pengecekan skema utama.
const raw = (q: string) => ((sql as any).query ? (sql as any).query(q) : (sql as any)(q));
const DDL = [
  `alter table users add column if not exists dev_mode_at timestamptz`,
  `create table if not exists devices (
     id uuid primary key default gen_random_uuid(),
     user_id text not null references users(id) on delete cascade,
     label text not null, platform text, ip text,
     linked boolean not null default false,
     created_at timestamptz not null default now(),
     last_seen timestamptz not null default now(),
     revoked_at timestamptz)`,
  `create index if not exists devices_user_idx on devices (user_id, last_seen desc)`,
  `create table if not exists link_requests (
     code text primary key, secret_hash text not null,
     label text, platform text, ip text, user_id text,
     approved_at timestamptz, claimed_at timestamptz,
     expires_at timestamptz not null)`,
  `create table if not exists api_keys (
     id uuid primary key default gen_random_uuid(),
     user_id text not null references users(id) on delete cascade,
     name text not null, prefix text not null, hash text not null unique,
     created_at timestamptz not null default now(),
     last_used timestamptz, revoked_at timestamptz)`,
  `create index if not exists api_keys_user_idx on api_keys (user_id)`,
];
let ready: Promise<void> | null = null;
export function ensureDevTables() {
  ready ??= (async () => { for (const s of DDL) await raw(s); })().catch((e) => { ready = null; throw e; });
  return ready;
}
export async function withDev<T>(f: () => Promise<T>): Promise<T> {
  try { return await f(); } catch { await ensureDevTables(); return f(); }
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_LINKED = 4;
export const MAX_KEYS = 5;

export function describeUa(ua: string) {
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iOS" : /Windows/i.test(ua) ? "Windows" : /Mac OS X/i.test(ua) ? "macOS" : /Linux/i.test(ua) ? "Linux" : "Perangkat";
  const br = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return { label: `${br} di ${os}`, platform: os };
}

// Kode tautan 8 karakter tanpa huruf/angka yang mirip (0/O, 1/I).
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const newCode = () => Array.from(randomBytes(8), (b) => ALPHA[b % ALPHA.length]).join("");
export const normCode = (s: unknown) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
export const fmtCode = (c: string) => `${c.slice(0, 4)}-${c.slice(4)}`;

export async function createDevice(uid: string, d: { label: string; platform?: string; ip?: string; linked?: boolean }) {
  const [r] = await withDev(() => sql`
    insert into devices (user_id, label, platform, ip, linked)
    values (${uid}, ${d.label.slice(0, 60)}, ${d.platform ?? null}, ${d.ip ?? null}, ${!!d.linked}) returning id`);
  // Simpan paling banyak 20 perangkat per akun: yang paling lama tidak dipakai dibuang.
  sql`delete from devices where user_id = ${uid} and id not in (select id from devices where user_id = ${uid} order by last_seen desc limit 20)`.catch(() => {});
  return String(r.id);
}

const alive = new Map<string, { ok: boolean; t: number }>();
export const forgetDevice = (id: string) => alive.delete(id);
export async function deviceAlive(did: string): Promise<boolean> {
  const hit = alive.get(did);
  if (hit && Date.now() - hit.t < 8000) return hit.ok;
  let ok = true;
  if (UUID_RE.test(did)) {
    try {
      const rows = await withDev(() => sql`
        update devices set last_seen = case when last_seen < now() - interval '5 minutes' then now() else last_seen end
        where id = ${did}::uuid returning revoked_at`);
      ok = rows.length > 0 && !rows[0].revoked_at;
    } catch { ok = true; }
  } else ok = false;
  if (alive.size > 5000) alive.clear();
  alive.set(did, { ok, t: Date.now() });
  return ok;
}

export type DevKey = { id: string; name: string; prefix: string; created_at: string; last_used: string | null; username: string | null; owner: string };
export async function findDevKey(key: string): Promise<DevKey | null> {
  if (!/^kc_live_[A-Za-z0-9_-]{20,64}$/.test(key)) return null;
  const h = sha256(key);
  const [r] = await withDev(() => sql`
    select k.id, k.name, k.prefix, k.created_at, k.last_used, u.username, coalesce(u.name, u.username) as owner
    from api_keys k join users u on u.id = k.user_id
    where k.hash = ${h} and k.revoked_at is null and u.dev_mode_at is not null and u.banned_at is null`);
  if (!r) return null;
  if (!r.last_used || Date.now() - new Date(r.last_used as string).getTime() > 5 * 60_000)
    sql`update api_keys set last_used = now() where id = ${r.id}`.catch(() => {});
  return { id: String(r.id), name: String(r.name), prefix: String(r.prefix), created_at: new Date(r.created_at as string).toISOString(), last_used: r.last_used ? new Date(r.last_used as string).toISOString() : null, username: (r.username as string) ?? null, owner: String(r.owner ?? "") };
}
