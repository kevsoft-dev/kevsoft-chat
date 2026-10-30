import { TYPES } from "@/lib/cas";
import { casPublic, dbFail, fail, guard, intParam, preflight, reply } from "@/lib/publicApi";

export const OPTIONS = preflight;

// Komentar Kritik & Saran yang lolos peninjauan. Default: LIKE paling atas, lalu terbaru.
export async function GET(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  const sp = new URL(req.url).searchParams;
  const type = sp.get("type"), status = sp.get("status"), sort = sp.get("sort") === "new" ? "new" : "best";
  if (type && !(TYPES as readonly string[]).includes(type)) return fail(400, "type harus kritik, saran, atau lainnya");
  if (status && status !== "like" && status !== "acc") return fail(400, "status harus like atau acc");
  const size = intParam(sp.get("limit"), 50, 1, 100);
  try {
    let list = await casPublic(new URL(req.url).origin);
    if (type) list = list.filter((c) => c.type === type);
    if (status) list = list.filter((c) => c.status === status);
    list.sort((a, b) =>
      sort === "best" && a.status !== b.status ? (a.status === "like" ? -1 : 1) : a.id < b.id ? 1 : -1);
    const total = list.length;
    return reply({ total, count: Math.min(total, size), data: list.slice(0, size) });
  } catch (e) { return dbFail(e); }
}
