import { sql } from "./db";
import { readSession } from "./session";
import { COMMUNITY_ID } from "./mentions";
import { ensureSchema } from "./migrate";
import { isRootEmail, rank } from "./roles";

// Status blokir di-cache singkat per instance supaya tidak ada query tambahan di tiap request.
const BAN_TTL = 8_000;
const banCache = new Map<string, { v: boolean; t: number }>();
export const forgetBan = (uid: string) => banCache.delete(uid);

async function isBanned(uid: string) {
  const hit = banCache.get(uid);
  if (hit && Date.now() - hit.t < BAN_TTL) return hit.v;
  const q = () => sql`select (banned_at is not null) as b from users where id = ${uid}`;
  let rows: any[];
  try { rows = await q(); } catch { await ensureSchema(); rows = await q(); }
  const v = !!rows[0]?.b;
  if (banCache.size > 5000) banCache.clear();
  banCache.set(uid, { v, t: Date.now() });
  return v;
}

// userId SELALU dari cookie sesi yang ditandatangani server, tidak pernah dari body request.
// Akun yang diblokir dianggap tidak login (null).
export async function getUserId() {
  const uid = await readSession();
  if (!uid) return null;
  return (await isBanned(uid)) ? null : uid;
}

export type Actor = { id: string; role: string; email: string | null; username: string | null; name: string };

export async function getActor(): Promise<Actor | null> {
  const uid = await getUserId();
  if (!uid) return null;
  const [u] = await sql`select id, role, email, username, name from users where id = ${uid}`;
  if (!u) return null;
  return { id: u.id as string, role: String(u.role ?? "user"), email: (u.email as string | null) ?? null, username: (u.username as string | null) ?? null, name: String(u.name || u.username || "Staf") };
}

export async function getStaff() {
  const a = await getActor();
  return a && rank(a.role) >= 1 ? a : null;
}

// Setiap user otomatis masuk Komunitas Kevsoft (kecuali sedang di-kick) dan punya chat Kev-Ai sendiri.
export async function ensureDefaults(userId: string) {
  // Email di config owners selalu role owner (console penuh).
  const [u] = await sql`select email from users where id = ${userId}`;
  if (u?.email && isRootEmail(String(u.email))) {
    await sql`update users set role = 'owner' where id = ${userId} and role is distinct from 'owner'`;
  }
  await sql`
    insert into conversation_members (conversation_id, user_id)
    select ${COMMUNITY_ID}::uuid, ${userId}
    where not exists (select 1 from conversation_kicks where conversation_id = ${COMMUNITY_ID}::uuid and user_id = ${userId})
    on conflict do nothing`;
  const [ai] = await sql`
    insert into conversations (kind, title, created_by) values ('ai', 'Kev-Ai', ${userId})
    on conflict (created_by) where kind = 'ai' do nothing returning id`;
  if (ai)
    await sql`insert into conversation_members (conversation_id, user_id) values (${ai.id}, ${userId}) on conflict do nothing`;
}
