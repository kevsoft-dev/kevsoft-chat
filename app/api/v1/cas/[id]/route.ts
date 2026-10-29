import { ID_RE } from "@/lib/firebaseDb";
import { casPublic, dbFail, fail, guard, preflight, reply } from "@/lib/publicApi";

export const OPTIONS = preflight;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(req);
  if (denied) return denied;
  const { id } = await params;
  if (!ID_RE.test(id)) return fail(400, "ID komentar tidak valid");
  try {
    const c = (await casPublic(new URL(req.url).origin)).find((x) => x.id === id);
    return c ? reply({ data: c }) : fail(404, "Komentar tidak ditemukan atau belum lolos peninjauan");
  } catch (e) { return dbFail(e); }
}
