import { z } from "zod";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { broadcast, pushTo } from "@/lib/messages";
import { USERNAME_RE } from "@/lib/mentions";

// Gabung grup lewat handle atau id (link share).
export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });

  const parsed = z.object({
    handle: z.string().trim().toLowerCase().max(20).optional(),
    id: z.string().uuid().optional(),
  }).safeParse(await req.json().catch(() => null));
  if (!parsed.success || (!parsed.data.handle && !parsed.data.id))
    return Response.json({ error: "Handle atau id grup wajib" }, { status: 400 });

  const { handle, id } = parsed.data;
  if (handle && !USERNAME_RE.test(handle))
    return Response.json({ error: "Handle tidak valid" }, { status: 400 });

  const [g] = id
    ? await sql`select id, kind, title, handle from conversations where id = ${id}::uuid and kind = 'group'`
    : await sql`select id, kind, title, handle from conversations where lower(handle) = ${handle!} and kind = 'group'`;

  if (!g) return Response.json({ error: "Grup tidak ditemukan" }, { status: 404 });

  // Sudah anggota?
  const [mem] = await sql`select 1 from conversation_members where conversation_id = ${g.id} and user_id = ${uid}`;
  if (!mem) {
    // Cek kick
    const [kicked] = await sql`
      select 1 from conversation_kicks where conversation_id = ${g.id} and user_id = ${uid}`;
    if (kicked) return Response.json({ error: "Kamu dikeluarkan dari grup ini" }, { status: 403 });

    await sql`
      insert into conversation_members (conversation_id, user_id, role)
      values (${g.id}, ${uid}, 'member')
      on conflict do nothing`;
    await Promise.all([
      broadcast(g.id as string, "conversation", { id: g.id }),
      pushTo(uid, "conversation", { id: g.id }),
    ]);
  }

  return Response.json({ id: g.id, title: g.title, handle: g.handle, joined: !mem });
}
