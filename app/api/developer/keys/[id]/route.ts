import { sql } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { UUID_RE, withDev } from "@/lib/devices";

export async function DELETE(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return Response.json({ error: "ID tidak valid" }, { status: 400 });
  const rows = await withDev(() => sql`update api_keys set revoked_at = now() where id = ${id}::uuid and user_id = ${uid} and revoked_at is null returning id`);
  return rows.length ? Response.json({ ok: true }) : Response.json({ error: "Key tidak ditemukan" }, { status: 404 });
}
