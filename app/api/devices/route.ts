import { sql } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { readSessionMeta } from "@/lib/session";
import { MAX_LINKED, withDev } from "@/lib/devices";

export async function GET() {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  const m = await readSessionMeta();
  const rows = await withDev(() => sql`
    select id, label, platform, ip, linked, created_at, last_seen from devices
    where user_id = ${uid} and revoked_at is null order by last_seen desc limit 20`);
  const devices = rows.map((d) => ({
    id: String(d.id), label: String(d.label), platform: (d.platform as string) ?? null, ip: (d.ip as string) ?? null,
    linked: !!d.linked, current: !!m?.did && m.did === String(d.id),
    created_at: new Date(d.created_at as string).toISOString(), last_seen: new Date(d.last_seen as string).toISOString(),
  }));
  return Response.json({ devices, max_linked: MAX_LINKED, legacy_session: !m?.did });
}
