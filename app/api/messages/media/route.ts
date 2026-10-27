import { after } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { broadcast, getMessage } from "@/lib/messages";

export const maxDuration = 60;

// Kirim gambar/file (bukan zip). Max ~400KB base64 di body JSON.
const ALLOWED = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "application/pdf",
  "text/plain", "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });

  const parsed = z.object({
    id: z.string().uuid().optional(),
    conversationId: z.string().uuid(),
    body: z.string().max(4000).optional(),
    replyTo: z.string().uuid().optional(),
    mime: z.string().max(120),
    name: z.string().max(180),
    data: z.string().min(10).max(600_000), // ~450KB file
  }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Data tidak valid" }, { status: 400 });

  const { conversationId, body, replyTo, mime, name, data } = parsed.data;
  const msgId = parsed.data.id ?? crypto.randomUUID();

  if (!ALLOWED.has(mime)) {
    return Response.json({ error: "Tipe file tidak diizinkan (gambar, PDF, dokumen, teks). ZIP tidak didukung." }, { status: 400 });
  }
  if (/\.zip$/i.test(name) || mime.includes("zip") || mime.includes("compressed")) {
    return Response.json({ error: "File ZIP tidak diizinkan" }, { status: 400 });
  }

  const caption = (body ?? "").trim().slice(0, 4000);

  const rows = await sql`
    insert into messages (id, conversation_id, sender_id, body, reply_to, media_mime, media_data, media_name, expires_at)
    select ${msgId}::uuid, ${conversationId}::uuid, ${uid}, ${caption},
      (select id from messages where id = ${replyTo ?? null}::uuid and conversation_id = ${conversationId}::uuid),
      ${mime}, ${data}, ${name},
      case when c.disappear_seconds > 0 then now() + make_interval(secs => c.disappear_seconds)
           else now() + interval '1 day' end
    from conversations c
    where c.id = ${conversationId}::uuid
      and exists (select 1 from conversation_members where conversation_id = ${conversationId}::uuid and user_id = ${uid})
      and not exists (select 1 from users where id = ${uid} and muted_until > now())
    on conflict (id) do nothing
    returning id, created_at`;

  if (rows.length === 0) {
    const [ex] = await sql`select id, created_at from messages where id = ${msgId}::uuid and sender_id = ${uid}`;
    if (!ex) return new Response("Forbidden", { status: 403 });
    return Response.json(ex);
  }

  after(async () => {
    try {
      const msg = await getMessage(rows[0].id);
      await Promise.all([
        sql`update conversation_members set last_read_at = now() where conversation_id = ${conversationId} and user_id = ${uid}`,
        broadcast(conversationId, "message", msg),
      ]);
    } catch {}
  });

  return Response.json({ id: rows[0].id, created_at: rows[0].created_at });
}
