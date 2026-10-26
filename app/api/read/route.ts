import { z } from "zod";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/auth";

export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  const p = z.object({ conversationId: z.string().uuid() }).safeParse(await req.json().catch(() => null));
  if (!p.success) return new Response("Bad request", { status: 400 });
  await sql`update conversation_members set last_read_at = now()
            where conversation_id = ${p.data.conversationId} and user_id = ${uid}`;
  return Response.json({ ok: true });
}
