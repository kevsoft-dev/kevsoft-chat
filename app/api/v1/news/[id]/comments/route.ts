import { db, ID_RE } from "@/lib/firebaseDb";
import { getRequestOrigin } from "@/lib/origin";
import { dbFail, fail, guardPublic, newsComments, preflight, reply, toTree } from "@/lib/publicApi";

export const OPTIONS = preflight;

/**
 * GET /api/v1/news/{id}/comments
 * Publik 100% — tanpa API key. Semua komentar berita (data lengkap).
 * Query: tree=1 → balasan bersarang.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardPublic(req);
  if (denied) return denied;

  const { id } = await params;
  if (!ID_RE.test(id)) return fail(400, "ID berita tidak valid");

  const origin = getRequestOrigin(req);
  const tree = new URL(req.url).searchParams.get("tree") === "1";

  try {
    // Pastikan berita ada
    const n = (await db("GET", `news/${id}`)).data;
    if (!n || typeof n.title !== "string") return fail(404, "Berita tidak ditemukan");

    const flat = await newsComments(id, origin);
    return reply({
      news_id: id,
      count: flat.length,
      data: tree ? toTree(flat) : flat,
    });
  } catch (e) {
    return dbFail(e);
  }
}
