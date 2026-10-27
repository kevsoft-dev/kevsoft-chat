import { z } from "zod";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/auth";

export async function GET(req: Request) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  const cid = z.string().uuid().safeParse(new URL(req.url).searchParams.get("conversationId"));
  if (!cid.success) return new Response("Bad request", { status: 400 });

  const rows = await sql`
    select u.id, u.username, u.name, u.avatar_url, u.bio, cm.role
    from conversation_members cm join users u on u.id = cm.user_id
    where cm.conversation_id = ${cid.data}
      and exists (select 1 from conversation_members where conversation_id = ${cid.data} and user_id = ${uid})
    order by (cm.role = 'admin') desc, u.username limit 300`;
  return Response.json(rows);
}
