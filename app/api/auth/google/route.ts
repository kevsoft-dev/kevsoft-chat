import { clientIp, limit, tooMany } from "@/lib/ratelimit";
import { z } from "zod";
import { verifyFirebaseToken } from "@/lib/firebase-verify";
import { startSession } from "@/lib/session";
import { banNotice, upsertUserByEmail } from "@/lib/users";

export async function POST(req: Request) {
  const p = z.object({ idToken: z.string().min(20).max(4000) }).safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "Token tidak valid" }, { status: 400 });
  const rl = await limit(`google:ip:${clientIp(req)}`, 30, 900);
  if (!rl.ok) return tooMany(rl);
  try {
    const f = await verifyFirebaseToken(p.data.idToken);
    const uid = await upsertUserByEmail(f.email, f.name, f.picture);
    const ban = await banNotice(uid);
    if (ban) return Response.json({ error: ban }, { status: 403 });
    await startSession(uid, "google");
    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ error: "Login Google gagal. Coba lagi." }, { status: 401 });
  }
}
