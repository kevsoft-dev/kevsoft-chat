import { db, ID_RE } from "@/lib/firebaseDb";
import { getRequestOrigin } from "@/lib/origin";
import { dbFail, fail, guardPublic, newsItem, newsComments, preflight, reply, toTree } from "@/lib/publicApi";

export const OPTIONS = preflight;

/**
 * GET /api/v1/news/{id}
 * Publik 100% — tanpa API key.
 * Query: comments=1, tree=1 → sertakan komentar lengkap.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardPublic(req);
  if (denied) return denied;

  const { id } = await params;
  if (!ID_RE.test(id)) return fail(400, "ID berita tidak valid");

  const origin = getRequestOrigin(req);
  const sp = new URL(req.url).searchParams;
  const withComments = sp.get("comments") === "1" || sp.get("comments") === "true" || sp.get("all") === "1";
  const tree = sp.get("tree") === "1" || sp.get("tree") === "true";

  try {
    const n = (await db("GET", `news/${id}`)).data;
    if (!n || typeof n.title !== "string") return fail(404, "Berita tidak ditemukan");
    const item = newsItem(id, n);

    if (withComments) {
      const flat = await newsComments(id, origin);
      return reply({
        data: {
          ...item,
          comments_count: flat.length,
          comments: tree ? toTree(flat) : flat,
        },
      });
    }

    return reply({ data: item });
  } catch (e) {
    return dbFail(e);
  }
}
