import { sql } from "@/lib/db";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = (await ctx.params).id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const [row] = await sql`select mime, data from conversation_avatars where conversation_id = ${id}::uuid`;
  if (!row?.data) return new Response("Not found", { status: 404 });
  const buf = Buffer.from(String(row.data), "base64");
  return new Response(buf, {
    headers: {
      "Content-Type": String(row.mime || "image/jpeg"),
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
