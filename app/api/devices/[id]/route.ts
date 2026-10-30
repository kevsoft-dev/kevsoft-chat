import { sql } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { endSession, readSessionMeta } from "@/lib/session";
import { forgetDevice, UUID_RE, withDev } from "@/lib/devices";

// Keluarkan satu perangkat. Token perangkat itu langsung tidak berlaku (dicek di getUserId).
export async function DELETE(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return Response.json({ error: "ID tidak valid" }, { status: 400 });
  const rows = await withDev(() => sql`update devices set revoked_at = now() where id = ${id}::uuid and user_id = ${uid} and revoked_at is null returning id`);
  if (!rows.length) return Response.json({ error: "Perangkat tidak ditemukan" }, { status: 404 });
  forgetDevice(id);
  const m = await readSessionMeta();
  const self = m?.did === id;
  if (self) await endSession();
  return Response.json({ ok: true, self });
}
