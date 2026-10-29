import { db, ID_RE } from "@/lib/firebaseDb";
import { dbFail, fail, guard, newsComments, preflight, reply, toTree } from "@/lib/publicApi";

export const OPTIONS = preflight;

// Komentar berita: daftar datar (urut lama -> baru) atau bersarang dengan ?tree=1.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(req);
  if (denied) return denied;
  const { id } = await params;
  if (!ID_RE.test(id)) return fail(400, "ID berita tidak valid");
  try {
    const title = (await db("GET", `news/${id}/title`)).data;
    if (!title) return fail(404, "Berita tidak ditemukan");
    const flat = await newsComments(id, new URL(req.url).origin);
    const tree = new URL(req.url).searchParams.get("tree") === "1";
    return reply({ news_id: id, count: flat.length, data: tree ? toTree(flat) : flat });
  } catch (e) { return dbFail(e); }
}
