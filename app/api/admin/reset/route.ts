import { z } from "zod";
import { sql } from "@/lib/db";
import { getStaff } from "@/lib/auth";
import { logMod } from "@/lib/audit";
import { COMMUNITY_ID } from "@/lib/mentions";
import { rank } from "@/lib/roles";

// Owner-only: hapus data massal (pesan / chat / semua kecuali akun owner).
export async function POST(req: Request) {
  const me = await getStaff();
  if (!me) return new Response("Forbidden", { status: 403 });
  if (rank(me.role) < 2) return Response.json({ error: "Hanya owner yang bisa mereset data" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const scope = z.enum(["messages", "chats", "all"]).safeParse(body?.scope);
  if (!scope.success) return Response.json({ error: "scope harus messages | chats | all" }, { status: 400 });
  const confirm = String(body?.confirm || "");
  if (confirm !== "RESET") {
    return Response.json({ error: "Ketik RESET untuk konfirmasi" }, { status: 400 });
  }

  const community = COMMUNITY_ID;

  if (scope.data === "messages") {
    // Hapus semua pesan (termasuk di Komunitas), biarkan chat & anggota.
    await sql`delete from messages`;
    await logMod({
      actorId: me.id,
      actorName: me.name,
      action: "reset_messages",
      detail: "semua pesan dihapus",
    });
    return Response.json({ ok: true, cleared: "messages" });
  }

  if (scope.data === "chats") {
    // Hapus semua chat non-sistem (bukan Komunitas, bukan AI per-user), dan semua pesan di dalamnya.
    // Komunitas tetap ada; AI chat user tetap (akan kosong).
    await sql`delete from messages where conversation_id in (
      select id from conversations where kind in ('dm', 'group')
    )`;
    await sql`delete from conversation_members where conversation_id in (
      select id from conversations where kind in ('dm', 'group')
    )`;
    await sql`delete from conversation_kicks where conversation_id in (
      select id from conversations where kind in ('dm', 'group')
    )`;
    await sql`delete from conversations where kind in ('dm', 'group')`;
    // Bersihkan pesan Komunitas juga (opsional — user minta clear)
    await sql`delete from messages where conversation_id = ${community}::uuid`;
    await logMod({
      actorId: me.id,
      actorName: me.name,
      action: "reset_chats",
      detail: "semua DM/grup + pesan komunitas dihapus",
    });
    return Response.json({ ok: true, cleared: "chats" });
  }

  // all: pesan + chat + kick + log moderasi lama, user non-owner tetap, tapi password & ban di-reset ringan
  await sql`delete from messages`;
  await sql`delete from conversation_members where conversation_id in (
    select id from conversations where kind in ('dm', 'group', 'ai')
  )`;
  await sql`delete from conversation_kicks`;
  await sql`delete from conversations where kind in ('dm', 'group', 'ai')`;
  await sql`delete from mod_logs where created_at < now() - interval '1 minute'`; // biarkan log reset ini
  // pastikan komunitas masih ada & kosong
  await sql`
    insert into conversations (id, kind, title, description)
    values (${community}::uuid, 'community', 'Komunitas Kevsoft', 'Tempat ngobrol publik semua member kevsoft.')
    on conflict (id) do nothing`;
  await sql`delete from messages where conversation_id = ${community}::uuid`;
  // semua user non-owner masuk lagi ke komunitas
  await sql`
    insert into conversation_members (conversation_id, user_id)
    select ${community}::uuid, id from users
    on conflict do nothing`;

  await logMod({
    actorId: me.id,
    actorName: me.name,
    action: "reset_all",
    detail: "reset data penuh: pesan, DM, grup, AI chat; komunitas dikosongkan",
  });
  return Response.json({ ok: true, cleared: "all" });
}
