import { db, ID_RE } from "@/lib/firebaseDb";
import { dbFail, fail, guard, intParam, newsItem, preflight, reply } from "@/lib/publicApi";

export const OPTIONS = preflight;

// Daftar berita terbaru -> lama. Halaman berikutnya: kirim next_cursor sebagai ?before=
export async function GET(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  const sp = new URL(req.url).searchParams;
  const size = intParam(sp.get("limit"), 20, 1, 50);
  const before = sp.get("before") ?? "";
  const q = (sp.get("q") ?? "").trim().toLowerCase().slice(0, 60);
  if (before && !ID_RE.test(before)) return fail(400, "Cursor (before) tidak valid");

  try {
    // Saat mencari, ambil jendela lebih besar lalu saring (Firebase tidak punya pencarian teks).
    const fetchN = q ? 200 : size + 1;
    const query: Record<string, string> = { orderBy: '"$key"', limitToLast: String(fetchN + (before ? 1 : 0)) };
    if (before) query.endAt = JSON.stringify(before);
    const raw = await db("GET", "news", undefined, query);
    let items = Object.entries((raw.data ?? {}) as Record<string, any>)
      .filter(([id, n]) => ID_RE.test(id) && id !== before && n && typeof n.title === "string")
      .map(([id, n]) => newsItem(id, n))
      .sort((a, b) => (a.id < b.id ? 1 : -1));
    if (q) items = items.filter((n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q));
    const more = items.length > size;
    items = items.slice(0, size);
    return reply({ data: items, count: items.length, next_cursor: more ? items[items.length - 1].id : null });
  } catch (e) { return dbFail(e); }
}
