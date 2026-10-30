import { db, ID_RE } from "@/lib/firebaseDb";
import { dbFail, fail, guard, newsItem, preflight, reply } from "@/lib/publicApi";

export const OPTIONS = preflight;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(req);
  if (denied) return denied;
  const { id } = await params;
  if (!ID_RE.test(id)) return fail(400, "ID berita tidak valid");
  try {
    const n = (await db("GET", `news/${id}`)).data;
    if (!n || typeof n.title !== "string") return fail(404, "Berita tidak ditemukan");
    return reply({ data: newsItem(id, n) });
  } catch (e) { return dbFail(e); }
}
