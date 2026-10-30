import { db, ID_RE } from "@/lib/firebaseDb";
import { getRequestOrigin } from "@/lib/origin";
import { dbFail, fail, guardPublic, intParam, newsItem, newsComments, preflight, reply, toTree } from "@/lib/publicApi";

export const OPTIONS = preflight;

/**
 * GET /api/v1/news
 *
 * Publik 100% — tanpa API key.
 *
 * Query:
 *   all=1          → semua berita + semua komentar (data lengkap) dalam 1 request
 *   limit          → 1–200 (default 20; diabaikan jika all=1)
 *   before         → cursor halaman berikutnya
 *   q              → cari di judul/isi
 *   comments=1     → sertakan komentar per berita (flat), bahkan tanpa all=1
 *   tree=1         → komentar bersarang (hanya jika comments/all aktif)
 */
export async function GET(req: Request) {
  const denied = await guardPublic(req);
  if (denied) return denied;

  const origin = getRequestOrigin(req);
  const sp = new URL(req.url).searchParams;
  const all = sp.get("all") === "1" || sp.get("all") === "true";
  const withComments = all || sp.get("comments") === "1" || sp.get("comments") === "true";
  const tree = sp.get("tree") === "1" || sp.get("tree") === "true";
  const size = all ? 500 : intParam(sp.get("limit"), 20, 1, 200);
  const before = all ? "" : (sp.get("before") ?? "");
  const q = (sp.get("q") ?? "").trim().toLowerCase().slice(0, 60);
  if (before && !ID_RE.test(before)) return fail(400, "Cursor (before) tidak valid");

  try {
    // Ambil jendela berita dari Firebase
    const fetchN = all ? 500 : (q ? 200 : size + 1);
    const query: Record<string, string> = { orderBy: '"$key"', limitToLast: String(fetchN + (before ? 1 : 0)) };
    if (before) query.endAt = JSON.stringify(before);

    const raw = await db("GET", "news", undefined, query);
    let items = Object.entries((raw.data ?? {}) as Record<string, any>)
      .filter(([id, n]) => ID_RE.test(id) && id !== before && n && typeof n.title === "string")
      .map(([id, n]) => newsItem(id, n))
      .sort((a, b) => (a.id < b.id ? 1 : -1));

    if (q) items = items.filter((n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q));

    let next_cursor: string | null = null;
    if (!all) {
      const more = items.length > size;
      items = items.slice(0, size);
      next_cursor = more ? items[items.length - 1]?.id ?? null : null;
    }

    // Sertakan komentar lengkap per berita
    if (withComments) {
      const data = [];
      for (const item of items) {
        const flat = await newsComments(item.id, origin);
        data.push({
          ...item,
          comments_count: flat.length,
          comments: tree ? toTree(flat) : flat,
        });
      }
      return reply({
        data,
        count: data.length,
        next_cursor,
        complete: all,
        includes: tree ? "comments_tree" : "comments",
      });
    }

    return reply({ data: items, count: items.length, next_cursor, complete: all });
  } catch (e) {
    return dbFail(e);
  }
}
