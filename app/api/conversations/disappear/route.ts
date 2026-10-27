import { z } from "zod";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { broadcast } from "@/lib/messages";

// Timer pesan sementara ala WhatsApp: 0 = mati, 86400 = 24 jam, 604800 = 7 hari, 7776000 = 90 hari.
const ALLOWED = [0, 86400, 604800, 7776000] as const;

export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });

  const parsed = z.object({
    conversationId: z.string().uuid(),
    seconds: z.number().int(),
  }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Data tidak valid" }, { status: 400 });

  const { conversationId, seconds } = parsed.data;
  if (!(ALLOWED as readonly number[]).includes(seconds)) {
    return Response.json({ error: "Durasi tidak didukung" }, { status: 400 });
  }

  // Hanya anggota; untuk grup/komunitas lebih baik admin, tapi WhatsApp DM = kedua pihak bisa ubah.
  const [mem] = await sql`
    select cm.role as member_role, c.kind, c.created_by
    from conversation_members cm
    join conversations c on c.id = cm.conversation_id
    where cm.conversation_id = ${conversationId}::uuid and cm.user_id = ${uid}`;
  if (!mem) return new Response("Forbidden", { status: 403 });
  if (mem.kind === "ai") return Response.json({ error: "Chat AI tidak mendukung pesan sementara" }, { status: 400 });

  // Grup/komunitas: hanya admin grup atau staf sistem.
  if (mem.kind === "group" || mem.kind === "community") {
    const [u] = await sql`select role from users where id = ${uid}`;
    const isStaff = u?.role === "owner" || u?.role === "admin";
    const isGroupAdmin = mem.member_role === "admin" || mem.created_by === uid;
    if (!isStaff && !isGroupAdmin) {
      return Response.json({ error: "Hanya admin yang bisa mengatur pesan sementara di grup" }, { status: 403 });
    }
  }

  await sql`update conversations set disappear_seconds = ${seconds} where id = ${conversationId}::uuid`;
  await broadcast(conversationId, "disappear", { conversationId, seconds });
  return Response.json({ ok: true, seconds });
}
