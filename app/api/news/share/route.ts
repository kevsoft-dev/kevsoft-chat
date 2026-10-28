import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { limit } from "@/lib/ratelimit";
import { db, dbError, ID_RE, inc } from "@/lib/firebaseDb";

export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  const p = z.object({ id: z.string() }).safeParse(await req.json().catch(() => null));
  if (!p.success || !ID_RE.test(p.data.id)) return new Response("Bad request", { status: 400 });
  const id = p.data.id;
  // Dihitung maksimal 1x per berita per user per jam (anti-spam angka share).
  const rl = await limit(`nshare:${uid}:${id}`, 1, 3600);
  if (!rl.ok) return Response.json({ ok: true, counted: false });
  try {
    if (!(await db("GET", `news/${id}/title`)).data) return new Response("Not found", { status: 404 });
    await db("PATCH", `news/${id}`, { shares: inc(1) });
    const c = await db("GET", `news/${id}/shares`);
    return Response.json({ ok: true, counted: true, shares: Math.max(0, Number(c.data) || 0) });
  } catch (e) { return dbError(e); }
}
