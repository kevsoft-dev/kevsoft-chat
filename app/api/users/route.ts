import { sql } from "@/lib/db";
import { getUserId } from "@/lib/auth";

// Cari user lewat username/nama. Dengan ?cid= hanya anggota percakapan itu (untuk autocomplete @tag).
export async function GET(req: Request) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").toLowerCase().replace(/[^a-z0-9_.\- ]/g, "").slice(0, 30);
  const cid = url.searchParams.get("cid");

  if (cid) {
    const rows = await sql`
      select u.id, u.username, u.name, u.avatar_url
      from users u
      join conversation_members cm on cm.user_id = u.id and cm.conversation_id = ${cid}
      where u.username is not null and u.banned_at is null and u.id <> ${uid}
        and exists (select 1 from conversation_members where conversation_id = ${cid} and user_id = ${uid})
        and (starts_with(u.username, ${q}) or position(${q} in lower(coalesce(u.name, ''))) > 0)
      order by (starts_with(u.username, ${q})) desc, u.username limit 8`;
    return Response.json(rows);
  }

  const rows = await sql`
    select u.id, u.username, u.name, u.avatar_url from users u
    where u.username is not null and u.banned_at is null and u.id <> ${uid}
      and (starts_with(u.username, ${q}) or position(${q} in lower(coalesce(u.name, ''))) > 0)
    order by (starts_with(u.username, ${q})) desc, u.username limit 20`;
  return Response.json(rows);
}
