import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { limit, tooMany } from "@/lib/ratelimit";
import { db, dbError, ID_RE, inc } from "@/lib/firebaseDb";

export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  const p = z.object({ id: z.string() }).safeParse(await req.json().catch(() => null));
  if (!p.success || !ID_RE.test(p.data.id)) return new Response("Bad request", { status: 400 });
  const rl = await limit(`nlike:${uid}`, 60, 60);
  if (!rl.ok) return tooMany(rl);
  const id = p.data.id;
  try {
    if (!(await db("GET", `news/${id}/title`)).data) return new Response("Not found", { status: 404 });
    // PUT bersyarat (null_etag): hanya berhasil jika BELUM like. Ini membuat toggle aman dari klik ganda.
    const put = await db("PUT", `user_likes/${uid}/${id}`, true, {}, { "if-match": "null_etag" });
    let liked: boolean;
    if (put.status === 412) {
      await db("DELETE", `user_likes/${uid}/${id}`);
      await db("PATCH", `news/${id}`, { likes: inc(-1) });
      liked = false;
    } else {
      await db("PATCH", `news/${id}`, { likes: inc(1) });
      liked = true;
    }
    const c = await db("GET", `news/${id}/likes`);
    return Response.json({ liked, likes: Math.max(0, Number(c.data) || 0) });
  } catch (e) { return dbError(e); }
}
