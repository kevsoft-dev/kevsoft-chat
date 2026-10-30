import { createHash, timingSafeEqual } from "crypto";
import { cfg } from "./config";
import { sql } from "./db";
import { clientIp, limit } from "./ratelimit";
import { db, DbNotConfigured, ID_RE } from "./firebaseDb";
import { cleanButtons, cleanUrls } from "./news";
import { CAS_PATH, type CasRow } from "./cas";

// API publik read-only: berita, komentar berita, dan komentar /cas.
// Tidak pernah membocorkan id internal user / email: hanya username, nama, foto, centang.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "x-api-key, authorization, content-type",
  "Access-Control-Max-Age": "86400",
};

export const preflight = () => new Response(null, { status: 204, headers: CORS });
// no-store: respons bergantung pada API key, jadi tidak boleh di-cache bersama oleh CDN.
export const reply = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
  Response.json(data, { status, headers: { ...CORS, "Cache-Control": "no-store", ...extra } });
export const fail = (status: number, message: string, extra: Record<string, string> = {}) => reply({ error: message }, status, extra);
export const dbFail = (e: unknown) =>
  e instanceof DbNotConfigured ? fail(503, e.message) : fail(502, "Database sedang bermasalah. Coba lagi nanti.");

const shaBuf = (s: string) => createHash("sha256").update(s).digest();
const shaHex = (s: string) => createHash("sha256").update(s).digest("hex");
const hashedKeys = cfg.api.keys.map(shaBuf);
const keyOkMaster = (k: string) => { const h = shaBuf(k); return hashedKeys.some((x) => timingSafeEqual(h, x)); };

function extractKey(req: Request): string {
  const h = req.headers.get("x-api-key") || (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return (h || new URL(req.url).searchParams.get("key") || "").trim().slice(0, 200);
}

/** Cek apakah key milik user developer (api_keys table). */
async function keyOkUser(k: string): Promise<boolean> {
  if (!k.startsWith("kc_") || k.length < 20) return false;
  const hash = shaHex(k);
  const [row] = await sql`
    select id from api_keys
    where key_hash = ${hash} and revoked_at is null
    limit 1`;
  if (!row) return false;
  // Touch last_used (fire-and-forget style)
  await sql`update api_keys set last_used_at = now() where id = ${row.id}`;
  return true;
}

// Cek API key + rate limit. Mengembalikan Response kalau ditolak, null kalau lolos.
export async function guard(req: Request): Promise<Response | null> {
  const ip = clientIp(req);
  let who = `ip:${ip}`;
  const key = extractKey(req);
  if (!cfg.api.public) {
    const masterOk = key && hashedKeys.length > 0 && keyOkMaster(key);
    const userOk = !masterOk && key ? await keyOkUser(key) : false;
    if (!masterOk && !userOk) {
      if (!hashedKeys.length) {
        // Masih boleh lolos jika ada user key yang valid (sudah dicek di atas)
        // Jika tidak ada master key sama sekali dan user key juga gagal:
        const anyUser = await sql`select 1 from api_keys where revoked_at is null limit 1`;
        if (!anyUser.length) return fail(503, "API belum diaktifkan. Isi api.keys di config.json atau aktifkan Mode Developer.");
      }
      const bad = await limit(`apibad:${ip}`, 20, 600);
      if (!bad.ok) return fail(429, "Terlalu banyak percobaan. Coba lagi nanti.", { "Retry-After": String(bad.retry) });
      return fail(401, "API key tidak ada atau tidak valid. Kirim lewat header x-api-key.", { "WWW-Authenticate": 'Bearer realm="kevsoft-api"' });
    }
    who = `k:${shaHex(key).slice(0, 12)}`;
  }
  const l = await limit(`api:${who}`, 120, 60);
  if (!l.ok) return fail(429, "Batas 120 permintaan per menit terlampaui.", { "Retry-After": String(l.retry) });
  return null;
}

/**
 * Guard khusus news + comments: SELALU publik (tanpa API key).
 * Hanya rate-limit per IP agar tidak disalahgunakan.
 */
export async function guardPublic(req: Request): Promise<Response | null> {
  const ip = clientIp(req);
  const l = await limit(`api:public:${ip}`, 180, 60);
  if (!l.ok) return fail(429, "Batas 180 permintaan per menit per IP terlampaui.", { "Retry-After": String(l.retry) });
  return null;
}

export const intParam = (v: string | null, def: number, min: number, max: number) => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const iso = (ms: unknown) => new Date(Number(ms) || 0).toISOString();
const abs = (u: unknown, origin: string) => (u ? (/^https?:\/\//.test(String(u)) ? String(u) : origin + (String(u).startsWith("/") ? "" : "/") + String(u)) : null);

export type Prof = { username: string; name: string; avatar_url: string | null; verified: boolean; role: string };
export async function profiles(ids: string[], origin: string): Promise<Map<string, Prof>> {
  if (!ids.length) return new Map();
  const us = await sql`
    select id, username, coalesce(name, username) as name, avatar_url, role, verified
    from users where id = any(${ids}::text[]) and banned_at is null and username is not null`;
  return new Map(us.map((u) => [u.id as string, {
    username: u.username as string, name: String(u.name), avatar_url: abs(u.avatar_url, origin),
    verified: !!u.verified || u.role === "owner", role: String(u.role),
  }]));
}

export function newsItem(id: string, n: any) {
  return {
    id, title: String(n.title), body: String(n.body ?? ""),
    buttons: cleanButtons(n.buttons), images: cleanUrls(n.images, 6), videos: cleanUrls(n.videos, 3),
    author: String(n.author ?? "Kevsoft"), created_at: iso(n.createdAt),
    likes: Math.max(0, Number(n.likes) || 0), comments: Math.max(0, Number(n.comments) || 0), shares: Math.max(0, Number(n.shares) || 0),
  };
}

export async function newsComments(newsId: string, origin: string) {
  const r = await db("GET", `news_comments/${newsId}`, undefined, { orderBy: '"$key"', limitToLast: "500" });
  const list = Object.entries((r.data ?? {}) as Record<string, any>).filter(([id, c]) => ID_RE.test(id) && c && typeof c.body === "string");
  const profs = await profiles([...new Set(list.map(([, c]) => String(c.userId)))], origin);
  return list
    .filter(([, c]) => profs.has(String(c.userId)))
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([id, c]) => ({
      id, parent_id: (c.parentId as string | null) || null, body: String(c.body),
      mentions: Array.isArray(c.mentions) ? (c.mentions as string[]) : [], created_at: iso(c.createdAt), user: profs.get(String(c.userId))!,
    }));
}

export type FlatComment = Awaited<ReturnType<typeof newsComments>>[number];
export type TreeComment = FlatComment & { replies: TreeComment[] };
export function toTree(flat: FlatComment[]): TreeComment[] {
  const by = new Map<string, TreeComment>(flat.map((c) => [c.id, { ...c, replies: [] }]));
  const roots: TreeComment[] = [];
  for (const c of by.values()) { const p = c.parent_id ? by.get(c.parent_id) : undefined; (p ? p.replies : roots).push(c); }
  return roots;
}

// Komentar /cas yang sudah lolos peninjauan (ACC / LIKE). Yang masih direview tidak pernah keluar lewat API.
export async function casPublic(origin: string) {
  const r = await db("GET", CAS_PATH, undefined, { orderBy: '"$key"', limitToLast: "300" });
  const rows = Object.entries((r.data ?? {}) as Record<string, CasRow>)
    .filter(([id, c]) => ID_RE.test(id) && c && typeof c.body === "string" && (c.status === "acc" || c.status === "like"));
  const profs = await profiles([...new Set(rows.map(([, c]) => c.userId))], origin);
  return rows.filter(([, c]) => profs.has(c.userId)).map(([id, c]) => ({
    id, body: c.body, type: c.type, status: c.status as "acc" | "like",
    created_at: iso(c.createdAt), reviewed_at: c.reviewedAt ? iso(c.reviewedAt) : null, user: profs.get(c.userId)!,
  }));
}
