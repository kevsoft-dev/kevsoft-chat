import { after } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { getActor, getUserId } from "@/lib/auth";
import { limit, tooMany } from "@/lib/ratelimit";
import { parseMentions } from "@/lib/mentions";
import { pushTo } from "@/lib/messages";
import { canManage } from "@/lib/roles";
import { db, dbError, ID_RE, inc, newId } from "@/lib/firebaseDb";

type C = { userId: string; parentId?: string | null; body: string; mentions?: string[]; createdAt: number };

async function load(newsId: string) {
  const r = await db("GET", `news_comments/${newsId}`, undefined, { orderBy: '"$key"', limitToLast: "500" });
  return Object.entries((r.data ?? {}) as Record<string, C>).filter(([id, c]) => ID_RE.test(id) && c && typeof c.body === "string");
}

// Komentar disimpan di Firebase; data profil penulis (nama/foto/role) selalu diambil segar dari Neon.
export async function GET(req: Request) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  const newsId = new URL(req.url).searchParams.get("id") ?? "";
  if (!ID_RE.test(newsId)) return new Response("Bad request", { status: 400 });
  try {
    const list = await load(newsId);
    const ids = [...new Set(list.map(([, c]) => c.userId))];
    const us = ids.length
      ? await sql`select id, username, coalesce(name, username) as name, avatar_url, role, verified from users where id = any(${ids}::text[]) and banned_at is null`
      : [];
    const byId = new Map(us.map((u) => [u.id as string, u]));
    const comments = list
      .filter(([, c]) => byId.has(c.userId))
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([id, c]) => {
        const u = byId.get(c.userId)!;
        return {
          id, parent_id: c.parentId || null, body: c.body, mentions: Array.isArray(c.mentions) ? c.mentions : [],
          created_at: new Date(c.createdAt || 0).toISOString(), user_id: c.userId,
          username: u.username, name: u.name, avatar_url: u.avatar_url, role: u.role, verified: !!u.verified,
        };
      });
    return Response.json({ comments });
  } catch (e) { return dbError(e); }
}

const schema = z.object({
  newsId: z.string(),
  body: z.string().trim().min(1).max(500),
  parentId: z.string().nullish(),
});

export async function POST(req: Request) {
  const me = await getActor();
  if (!me) return new Response("Unauthorized", { status: 401 });
  const p = schema.safeParse(await req.json().catch(() => null));
  if (!p.success || !ID_RE.test(p.data.newsId) || (p.data.parentId && !ID_RE.test(p.data.parentId)))
    return Response.json({ error: "Komentar tidak valid (1-500 karakter)" }, { status: 400 });
  const { newsId, body, parentId } = p.data;
  const rl = await limit(`ncom:${me.id}`, 10, 60);
  if (!rl.ok) return tooMany(rl, "Kamu berkomentar terlalu cepat.");
  const [mu] = await sql`select 1 as x from users where id = ${me.id} and muted_until > now()`;
  if (mu) return Response.json({ error: "Kamu sedang dibisukan oleh moderator" }, { status: 403 });

  try {
    const title = (await db("GET", `news/${newsId}/title`)).data;
    if (!title) return new Response("Not found", { status: 404 });
    let parentUser: string | null = null;
    if (parentId) {
      const pc = (await db("GET", `news_comments/${newsId}/${parentId}`)).data as C | null;
      if (!pc) return Response.json({ error: "Komentar yang dibalas tidak ada" }, { status: 400 });
      parentUser = pc.userId;
    }
    // Hanya username yang benar-benar ada yang dianggap tag.
    const wanted = parseMentions(body);
    const tagged = wanted.length ? await sql`select id, username from users where username = any(${wanted}::text[]) and banned_at is null` : [];
    const mentions = tagged.map((t) => t.username as string);
    const cid = newId();
    await db("PATCH", "", {
      [`news_comments/${newsId}/${cid}`]: { userId: me.id, parentId: parentId ?? null, body, mentions, createdAt: Date.now() },
      [`news/${newsId}/comments`]: inc(1),
    });
    const notify = new Set<string>(tagged.map((t) => t.id as string));
    if (parentUser) notify.add(parentUser);
    notify.delete(me.id);
    after(async () => {
      for (const u of notify) await pushTo(u, "news_mention", { newsId, title, from: me.username || me.name, reply: u === parentUser });
    });
    return Response.json({ ok: true, id: cid });
  } catch (e) { return dbError(e); }
}

// Hapus komentar (+ semua balasannya): penulisnya, atau owner (owner biasa hanya komentar user biasa; owner utama bebas).
export async function DELETE(req: Request) {
  const me = await getActor();
  if (!me) return new Response("Unauthorized", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const newsId = sp.get("news") ?? "", id = sp.get("id") ?? "";
  if (!ID_RE.test(newsId) || !ID_RE.test(id)) return new Response("Bad request", { status: 400 });
  try {
    const all = await load(newsId);
    const target = all.find(([cid]) => cid === id)?.[1];
    if (!target) return new Response("Not found", { status: 404 });
    if (target.userId !== me.id) {
      const [u] = await sql`select id, role, email from users where id = ${target.userId}`;
      const ok = me.role === "owner" && (!u || canManage(me, { id: u.id as string, role: String(u.role), email: (u.email as string | null) ?? null }));
      if (!ok) return Response.json({ error: "Tidak diizinkan" }, { status: 403 });
    }
    // Kumpulkan turunan (balasan, balasan-balasan, ...).
    const gone = new Set([id]);
    for (let grew = true; grew; ) { grew = false; for (const [cid, c] of all) if (c.parentId && gone.has(c.parentId) && !gone.has(cid)) { gone.add(cid); grew = true; } }
    const patch: Record<string, unknown> = { [`news/${newsId}/comments`]: inc(-gone.size) };
    for (const cid of gone) patch[`news_comments/${newsId}/${cid}`] = null;
    await db("PATCH", "", patch);
    return Response.json({ ok: true });
  } catch (e) { return dbError(e); }
}
