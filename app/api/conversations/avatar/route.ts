import { clientIp, limit, tooMany } from "@/lib/ratelimit";
import { z } from "zod";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { broadcast } from "@/lib/messages";

const MAX = 150_000;

function sniff(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

async function canManageGroup(uid: string, conversationId: string) {
  const [mem] = await sql`
    select cm.role as member_role, c.kind, c.created_by
    from conversation_members cm
    join conversations c on c.id = cm.conversation_id
    where cm.conversation_id = ${conversationId}::uuid and cm.user_id = ${uid}`;
  if (!mem || mem.kind !== "group") return false;
  return mem.member_role === "owner" || mem.member_role === "admin" || mem.created_by === uid;
}

export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  const rl = await limit(`gimg:${uid}`, 10, 600);
  if (!rl.ok) return tooMany(rl);

  const cid = z.string().uuid().safeParse(req.headers.get("x-conversation-id") || new URL(req.url).searchParams.get("id"));
  if (!cid.success) return Response.json({ error: "ID grup tidak valid" }, { status: 400 });
  if (!(await canManageGroup(uid, cid.data))) return Response.json({ error: "Hanya owner/admin grup" }, { status: 403 });

  if (Number(req.headers.get("content-length") ?? 0) > MAX * 2) return Response.json({ error: "Foto terlalu besar" }, { status: 413 });
  const buf = new Uint8Array(await req.arrayBuffer());
  if (buf.length < 100) return Response.json({ error: "File foto tidak valid" }, { status: 400 });
  if (buf.length > MAX) return Response.json({ error: "Foto terlalu besar" }, { status: 413 });
  const mime = sniff(buf);
  if (!mime) return Response.json({ error: "Format foto harus JPG, PNG, atau WebP" }, { status: 415 });

  const url = `/api/group-avatar/${cid.data}?v=${Date.now()}`;
  await sql`
    insert into conversation_avatars (conversation_id, mime, data)
    values (${cid.data}::uuid, ${mime}, ${Buffer.from(buf).toString("base64")})
    on conflict (conversation_id) do update set mime = excluded.mime, data = excluded.data, updated_at = now()`;
  await sql`update conversations set avatar_url = ${url} where id = ${cid.data}::uuid`;
  await broadcast(cid.data, "conversation", { id: cid.data, avatar_url: url });
  return Response.json({ avatar_url: url });
}

export async function DELETE(req: Request) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  const cid = z.string().uuid().safeParse(new URL(req.url).searchParams.get("id"));
  if (!cid.success) return Response.json({ error: "ID grup tidak valid" }, { status: 400 });
  if (!(await canManageGroup(uid, cid.data))) return Response.json({ error: "Hanya owner/admin grup" }, { status: 403 });

  await sql`delete from conversation_avatars where conversation_id = ${cid.data}::uuid`;
  await sql`update conversations set avatar_url = null where id = ${cid.data}::uuid`;
  await broadcast(cid.data, "conversation", { id: cid.data, avatar_url: null });
  return Response.json({ avatar_url: null });
}
