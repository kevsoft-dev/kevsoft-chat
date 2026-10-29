import { z } from "zod";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { broadcast, pushTo } from "@/lib/messages";
import { USERNAME_RE } from "@/lib/mentions";
import { INVITE_RE } from "@/lib/invite";
import { limit, tooMany } from "@/lib/ratelimit";

// Cari grup PUBLIK (yang diberi username oleh admin grup). Grup tanpa username tidak pernah muncul.
export async function GET(req: Request) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  const q = (new URL(req.url).searchParams.get("q") || "").trim().toLowerCase().replace(/^@/, "").slice(0, 30);
  if (q.length < 2) return Response.json([]);
  const l = await limit(`gsearch:${uid}`, 40, 60);
  if (!l.ok) return tooMany(l);
  const like = q.replace(/[\\%_]/g, (m) => "\\" + m);
  const rows = await sql`
    select c.id, c.title, c.handle, c.description, c.avatar_url,
      (select count(*) from conversation_members m where m.conversation_id = c.id)::int as member_count,
      exists (select 1 from conversation_members m where m.conversation_id = c.id and m.user_id = ${uid}) as joined
    from conversations c
    where c.kind = 'group' and c.handle is not null
      and (lower(c.handle) like ${like + "%"} or lower(c.title) like ${"%" + like + "%"})
    order by (lower(c.handle) = ${q}) desc, member_count desc
    limit 15`;
  return Response.json(rows);
}

// Gabung grup: lewat kode undangan (link privat) atau username grup (grup publik).
export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });

  const parsed = z.object({
    code: z.string().trim().max(64).optional(),
    handle: z.string().trim().toLowerCase().max(20).optional(),
  }).safeParse(await req.json().catch(() => null));
  if (!parsed.success || (!parsed.data.code && !parsed.data.handle))
    return Response.json({ error: "Kode undangan atau username grup wajib" }, { status: 400 });

  // Batasi percobaan supaya kode/username tidak bisa ditebak-tebak.
  const l = await limit(`gjoin:${uid}`, 30, 600);
  if (!l.ok) return tooMany(l);

  const { code, handle } = parsed.data;
  if (code && !INVITE_RE.test(code))
    return Response.json({ error: "Link undangan tidak valid atau sudah direset" }, { status: 404 });
  if (!code && handle && !USERNAME_RE.test(handle))
    return Response.json({ error: "Username grup tidak valid" }, { status: 400 });

  const [g] = code
    ? await sql`select id, kind, title, handle from conversations where invite_code = ${code} and kind = 'group'`
    : await sql`select id, kind, title, handle from conversations where lower(handle) = ${handle!} and kind = 'group'`;

  if (!g) return Response.json({ error: code ? "Link undangan tidak valid atau sudah direset" : "Grup tidak ditemukan" }, { status: 404 });

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
