import { z } from "zod";
import { getActor, getUserId } from "@/lib/auth";
import { limit, tooMany } from "@/lib/ratelimit";
import { cleanButtons, cleanUrls } from "@/lib/news";
import { db, dbError, ID_RE, newId } from "@/lib/firebaseDb";
import { logMod } from "@/lib/audit";

const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

// Daftar berita terbaru (semua user login boleh melihat). Data dari Firebase Realtime Database.
export async function GET() {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  try {
    const [raw, likedRaw] = await Promise.all([
      db("GET", "news", undefined, { orderBy: '"$key"', limitToLast: "20" }),
      db("GET", `user_likes/${uid}`),
    ]);
    const liked = (likedRaw.data ?? {}) as Record<string, unknown>;
    const news = Object.entries((raw.data ?? {}) as Record<string, any>)
      .filter(([id, n]) => ID_RE.test(id) && n && typeof n.title === "string")
      .map(([id, n]) => ({
        id,
        title: String(n.title),
        body: String(n.body ?? ""),
        buttons: cleanButtons(n.buttons),
        images: cleanUrls(n.images, 6),
        videos: cleanUrls(n.videos, 3),
        author: String(n.author ?? "Kevsoft"),
        created_at: new Date(Number(n.createdAt) || 0).toISOString(),
        likes: Math.max(0, Number(n.likes) || 0),
        comments: Math.max(0, Number(n.comments) || 0),
        share_count: Math.max(0, Number(n.shares) || 0),
        liked: !!liked[id],
      }))
      .sort((a, b) => (a.id < b.id ? 1 : -1));
    return Response.json({ news });
  } catch (e) { return dbError(e); }
}

const schema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().max(2000).default(""),
  buttons: z.array(z.object({ label: z.string(), url: z.string() })).max(3).default([]),
  images: z.array(z.string()).max(6).default([]),
  videos: z.array(z.string()).max(3).default([]),
});

// Tambah berita: HANYA owner.
export async function POST(req: Request) {
  const me = await getActor();
  if (!me) return new Response("Unauthorized", { status: 401 });
  if (me.role !== "owner") return Response.json({ error: "Hanya owner yang bisa menambah berita" }, { status: 403 });
  const rl = await limit(`news:${me.id}`, 20, 3600);
  if (!rl.ok) return tooMany(rl);
  const p = schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "Data berita tidak valid" }, { status: 400 });
  const d = p.data;
  const images = cleanUrls(d.images, 6), videos = cleanUrls(d.videos, 3);
  if (images.length !== d.images.filter((x) => x.trim()).length || videos.length !== d.videos.filter((x) => x.trim()).length)
    return Response.json({ error: "Semua URL gambar/video harus diawali https://" }, { status: 400 });
  const buttons = cleanButtons(d.buttons);
  if (buttons.length !== d.buttons.filter((b) => b.label.trim() || b.url.trim()).length)
    return Response.json({ error: "Tombol butuh label dan link https://" }, { status: 400 });
  const id = newId();
  try {
    await db("PUT", `news/${id}`, { title: d.title, body: d.body, buttons, images, videos, authorId: me.id, author: me.name, createdAt: Date.now(), likes: 0, comments: 0, shares: 0 });
  } catch (e) { return dbError(e); }
  await logMod({ actorId: me.id, actorName: me.name, action: "news_add", detail: d.title.slice(0, 80) });
  return Response.json({ ok: true, id });
}

// Hapus berita: HANYA owner.
export async function DELETE(req: Request) {
  const me = await getActor();
  if (!me) return new Response("Unauthorized", { status: 401 });
  if (me.role !== "owner") return Response.json({ error: "Hanya owner yang bisa menghapus berita" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!ID_RE.test(id)) return new Response("Bad request", { status: 400 });
  try {
    const t = await db("GET", `news/${id}/title`);
    if (!t.data) return new Response("Not found", { status: 404 });
    await db("PATCH", "", { [`news/${id}`]: null, [`news_comments/${id}`]: null });
    await logMod({ actorId: me.id, actorName: me.name, action: "news_delete", detail: String(t.data).slice(0, 80) });
    return Response.json({ ok: true });
  } catch (e) { return dbError(e); }
}
