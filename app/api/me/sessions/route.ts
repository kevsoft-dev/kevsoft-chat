import { sql } from "@/lib/db";
import { forgetAuth, getUserId } from "@/lib/auth";
import { endSession } from "@/lib/session";

// "Keluar dari semua perangkat": menaikkan versi sesi sehingga semua token lama (termasuk yang dicuri) langsung tidak berlaku.
export async function DELETE() {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  await sql`update users set token_version = token_version + 1 where id = ${uid}`;
  forgetAuth(uid);
  await endSession();
  return Response.json({ ok: true });
}
