import { sql } from "@/lib/db";
import { getUserId } from "@/lib/auth";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  const id = (await ctx.params).id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Bad request", { status: 400 });

  const [m] = await sql`
    select m.media_mime, m.media_data, m.media_name
    from messages m
    where m.id = ${id}::uuid and m.deleted_at is null and m.media_data is not null
      and (m.expires_at is null or m.expires_at > now())
      and exists (select 1 from conversation_members where conversation_id = m.conversation_id and user_id = ${uid})
      and not (${uid} = any(m.hidden_by))`;
  if (!m?.media_data) return new Response("Not found", { status: 404 });

  const buf = Buffer.from(String(m.media_data), "base64");
  return new Response(buf, {
    headers: {
      "Content-Type": String(m.media_mime || "application/octet-stream"),
      "Content-Disposition": `inline; filename="${String(m.media_name || "file").replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=86400",
    },
  });
}
