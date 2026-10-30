import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "crypto";
import { sql } from "./db";
import { cfg } from "./config";
import { getActor, type Actor } from "./auth";
import { isRootEmail } from "./roles";

// KEVSOFT-CHAT (/ghosh): ruang privat khusus email yang sudah di-ACC owner utama.
// - Semua pengirim tampil "Unknown": API tidak pernah mengirim username, nama, email, atau foto.
// - Pengirim di database hanya berupa HMAC (bukan id user), isi pesan dienkripsi AES-256-GCM.
// - Hanya owner utama (root) yang bisa membuat room dan menyetujui akses.

export const MAX_BODY = 1000;
export const MAX_ROOMS = 30;
export type AccessStatus = "pending" | "approved" | "rejected" | "revoked";
export type Gate = { actor: Actor; email: string; root: boolean; status: AccessStatus | "none"; lockdown: boolean };
export type Member = Gate & { tag: string; num: number };

const runRaw = (q: string) => ((sql as any).query ? (sql as any).query(q) : (sql as any)(q));
const DDL = [
  `create table if not exists ghosh_access (
     email text primary key, user_id text, status text not null default 'pending', note text,
     requested_at timestamptz not null default now(), decided_at timestamptz, decided_by text)`,
  `create table if not exists ghosh_rooms (
     id uuid primary key default gen_random_uuid(), name text not null, topic text,
     locked boolean not null default false, ttl_seconds int, created_at timestamptz not null default now())`,
  `create table if not exists ghosh_messages (
     id bigserial primary key, room_id uuid not null references ghosh_rooms(id) on delete cascade,
     sender text not null, body text not null, created_at timestamptz not null default now(), expires_at timestamptz)`,
  `alter table ghosh_messages add column if not exists mentions int[]`,
  `create index if not exists ghosh_messages_room_idx on ghosh_messages (room_id, id desc)`,
  `create table if not exists ghosh_audit (
     id bigserial primary key, actor text not null, action text not null, target text, detail text, at timestamptz not null default now())`,
  `create table if not exists ghosh_presence (user_id text primary key, seen_at timestamptz not null default now())`,
  `create table if not exists ghosh_settings (key text primary key, value text not null)`,
  `alter table ghosh_rooms add column if not exists kind text not null default 'group'`,
  `alter table ghosh_rooms add column if not exists a_tag text`,
  `alter table ghosh_rooms add column if not exists b_tag text`,
  `create unique index if not exists ghosh_dm_pair_idx on ghosh_rooms (a_tag, b_tag) where kind = 'dm'`,
  `create table if not exists ghosh_alias (tag text primary key, num int not null unique)`,
  `create table if not exists ghosh_reveals (
     from_tag text not null, to_tag text not null, from_user_id text not null, at timestamptz not null default now(),
     primary key (from_tag, to_tag))`,
  `insert into ghosh_rooms (name, topic) select 'lobby', 'ruang utama' where not exists (select 1 from ghosh_rooms where kind = 'group')`,
];

let ready: Promise<void> | null = null;
export function ensureGhosh() {
  ready ??= (async () => { for (const s of DDL) await runRaw(s); })().catch((e) => { ready = null; throw e; });
  return ready;
}

// ---------- kripto ----------
const KEY = createHash("sha256").update(`ghosh|msg|v1|${cfg.otpSecret}`).digest();
const MAC = createHash("sha256").update(`ghosh|sender|v1|${cfg.otpSecret}`).digest();
export const senderTag = (uid: string) => createHmac("sha256", MAC).update(uid).digest("hex").slice(0, 32);

export function seal(text: string, roomId: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", KEY, iv);
  c.setAAD(Buffer.from(roomId));
  const ct = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}
export function open(blob: string, roomId: string): string {
  try {
    const b = Buffer.from(blob, "base64");
    const d = createDecipheriv("aes-256-gcm", KEY, b.subarray(0, 12));
    d.setAAD(Buffer.from(roomId));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
  } catch { return "[tidak terbaca]"; }
}

// ---------- respons ----------
const H = { "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow, noarchive", "Referrer-Policy": "no-referrer" };
export const out = (data: unknown, status = 200) => Response.json(data, { status, headers: H });
export const deny = () => out({ error: "Not found" }, 404);   // sengaja samar: tidak membuka keberadaan ruang

export const cleanText = (s: unknown, max: number) =>
  String(s ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g, "").replace(/\r\n?/g, "\n").trim().slice(0, max);
// Tag @unknown1234 (tidak peka huruf besar/kecil). Maks. 5 per pesan.
export const MENTION_RE = /(?<![\w@])@unknown(\d{4,5})(?!\d)/gi;
export function mentionsOf(body: string): number[] {
  return [...new Set([...body.matchAll(MENTION_RE)].map((m) => Number(m[1])))].slice(0, 5);
}
export const normEmail = (s: unknown) => String(s ?? "").trim().toLowerCase().slice(0, 160);
export const EMAIL_RE = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,100}\.[a-z]{2,24}$/i;
export const ID_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------- akses ----------
export async function setting(key: string): Promise<string | null> {
  const [r] = await sql`select value from ghosh_settings where key = ${key}`;
  return r ? String(r.value) : null;
}
export const setSetting = (key: string, value: string) =>
  sql`insert into ghosh_settings (key, value) values (${key}, ${value}) on conflict (key) do update set value = excluded.value`;

export async function audit(actor: string, action: string, target?: string | null, detail?: string | null) {
  try { await sql`insert into ghosh_audit (actor, action, target, detail) values (${actor}, ${action}, ${target ?? null}, ${detail ?? null})`; } catch {}
}

// Dibaca dari database di SETIAP permintaan (tanpa cache) supaya pencabutan akses langsung berlaku.
export async function gate(): Promise<Gate | null> {
  const actor = await getActor();
  if (!actor || !actor.email) return null;
  await ensureGhosh();
  const email = normEmail(actor.email);
  const root = isRootEmail(email) && actor.role === "owner";
  const [a] = await sql`select status from ghosh_access where email = ${email}`;
  const lockdown = (await setting("lockdown")) === "1";
  // Tautkan akun ke email yang sudah di-ACC (sekali saja).
  if (a) sql`update ghosh_access set user_id = ${actor.id} where email = ${email} and user_id is distinct from ${actor.id}`.catch(() => {});
  return { actor, email, root, status: root ? "approved" : ((a?.status as AccessStatus | undefined) ?? "none"), lockdown };
}

// Alias anonim "Unknown{nomor}": nomor acak 4 digit, tetap untuk satu orang, dikaitkan ke HMAC (bukan id user).
export async function ensureAlias(tag: string): Promise<number> {
  const [a] = await sql`select num from ghosh_alias where tag = ${tag}`;
  if (a) return Number(a.num);
  for (let i = 0; i < 40; i++) {
    const num = i < 30 ? 1000 + Math.floor(Math.random() * 9000) : 10000 + Math.floor(Math.random() * 90000);
    const [r] = await sql`insert into ghosh_alias (tag, num) values (${tag}, ${num}) on conflict do nothing returning num`;
    if (r) return Number(r.num);
    const [again] = await sql`select num from ghosh_alias where tag = ${tag}`; // balapan: sudah dibuat permintaan lain
    if (again) return Number(again.num);
  }
  throw new Error("alias");
}
export const aliasName = (num: number) => `Unknown${num}`;

// Anggota aktif: root, atau status approved selama tidak lockdown.
export async function member(): Promise<Member | null> {
  const g = await gate();
  if (!g) return null;
  if (!(g.root || (g.status === "approved" && !g.lockdown))) return null;
  const tag = senderTag(g.actor.id);
  return { ...g, tag, num: await ensureAlias(tag) };
}
export async function rootOnly(): Promise<Gate | null> {
  const g = await gate();
  return g?.root ? g : null;
}

export async function touchPresence(uid: string) {
  sql`insert into ghosh_presence (user_id, seen_at) values (${uid}, now())
      on conflict (user_id) do update set seen_at = now()`.catch(() => {});
}
export async function onlineCount(): Promise<number> {
  const [r] = await sql`select count(*)::int as n from ghosh_presence where seen_at > now() - interval '40 seconds'`;
  return Number(r?.n ?? 0);
}

export async function purgeExpired() {
  if (Math.random() < 0.05) sql`delete from ghosh_messages where expires_at is not null and expires_at <= now()`.catch(() => {});
}

// Hak akses ke satu room: room grup terbuka untuk semua anggota; chat pribadi hanya untuk dua pesertanya (owner pun tidak).
export async function roomFor(roomId: string, tag: string) {
  const [r] = await sql`select id, kind, locked, ttl_seconds, a_tag, b_tag from ghosh_rooms where id = ${roomId}::uuid`;
  if (!r) return null;
  if (r.kind === "dm" && r.a_tag !== tag && r.b_tag !== tag) return null;
  return r;
}
