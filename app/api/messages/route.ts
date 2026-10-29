import { limit, tooMany } from "@/lib/ratelimit";
import { after } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { aiPrompt, AI_HANDLE, parseMentions } from "@/lib/mentions";
import { askKevAi } from "@/lib/ai";
import { broadcast, getMessage } from "@/lib/messages";
import { logMod } from "@/lib/audit";
import { getActor } from "@/lib/auth";
import { isRootEmail } from "@/lib/roles";

export const maxDuration = 60;
const uuid = z.string().uuid();

export async function GET(req: Request) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const cid = uuid.safeParse(sp.get("conversationId"));
  if (!cid.success) return new Response("Bad request", { status: 400 });
  const before = sp.get("before");
  const beforeTs = before && !Number.isNaN(Date.parse(before)) ? new Date(before).toISOString() : null;

  // Cek keanggotaan, filter "bersihkan chat" dan "hapus untuk saya" dalam satu query.
  const readMark = !beforeTs
    ? sql`update conversation_members set last_read_at = now() where conversation_id = ${cid.data} and user_id = ${uid}`
    : null;
  const [rows] = await Promise.all([
    sql`
      select m.id, m.conversation_id, m.sender_id, m.kind,
        case when m.deleted_at is null then m.body else '' end as body,
        m.created_at, m.deleted_at, m.reply_to, m.mentions,
        m.pinned_at, m.media_mime, m.media_name,
        case when m.media_data is not null and m.deleted_at is null then true else false end as has_media,
        case when m.deleted_at is null then m.poll_data else null end as poll_data,
        case when m.kind = 'ai' then 'kev-ai' else u.username end as username,
        case when m.kind = 'ai' then 'Kev-Ai' else coalesce(u.name, u.username) end as name,
        u.avatar_url,
        coalesce(u.role = 'owner' or u.verified, false) as verified,
        case when r.id is null then null when r.deleted_at is not null then '' else left(r.body, 140) end as reply_body,
        case when r.kind = 'ai' then 'kev-ai' else ru.username end as reply_username
      from conversation_members me
      join messages m on m.conversation_id = me.conversation_id
      left join users u on u.id = m.sender_id
      left join messages r on r.id = m.reply_to
      left join users ru on ru.id = r.sender_id
      where me.conversation_id = ${cid.data} and me.user_id = ${uid}
        and (me.cleared_at is null or m.created_at > me.cleared_at)
        and not (${uid} = any(m.hidden_by))
        and (m.expires_at is null or m.expires_at > now())
        and (${beforeTs}::timestamptz is null or m.created_at < ${beforeTs}::timestamptz)
      order by m.created_at desc limit 50`,
    readMark,
  ]);
  return Response.json((rows as any[]).reverse());
}

export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });

  const parsed = z.object({ id: uuid.optional(), conversationId: uuid, body: z.string().trim().min(1).max(4000), replyTo: uuid.optional() })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  const { id, conversationId, body, replyTo } = parsed.data;
  const rl = await limit(`msg:${uid}`, 20, 10);
  if (!rl.ok) return tooMany(rl, "Kamu mengirim terlalu cepat. Pelan-pelan ya.");

  const wanted = parseMentions(body);
  const wantsAi = wanted.includes(AI_HANDLE);
  const msgId = id ?? crypto.randomUUID();

  // Satu query: cek keanggotaan + validasi tag + simpan + expires_at dari timer chat.
  // ID dari klien membuat kirim ulang aman (idempoten).
  const rows = await sql`
    insert into messages (id, conversation_id, sender_id, body, mentions, reply_to, expires_at)
    select ${msgId}::uuid, ${conversationId}::uuid, ${uid}, ${body},
      array(select lower(username) from users where lower(username) = any(${wanted}::text[]))
        || ${wantsAi ? [AI_HANDLE] : []}::text[],
      (select id from messages where id = ${replyTo ?? null}::uuid and conversation_id = ${conversationId}::uuid),
      case when c.disappear_seconds > 0 then now() + make_interval(secs => c.disappear_seconds)
           else now() + interval '1 day' end
    from conversations c
    where c.id = ${conversationId}::uuid
      and exists (select 1 from conversation_members where conversation_id = ${conversationId}::uuid and user_id = ${uid})
      and not exists (select 1 from users where id = ${uid} and muted_until > now())
      and not exists (
        select 1 from conversation_members cm
        where cm.conversation_id = ${conversationId}::uuid and cm.user_id = ${uid}
          and cm.muted_until is not null and cm.muted_until > now()
      )
    on conflict (id) do nothing
    returning id, created_at, mentions`;

  if (rows.length === 0) {
    // Sudah tersimpan (kirim ulang)? Kembalikan hasil yang sama. Selain itu berarti bukan anggota.
    const [ex] = await sql`select id, created_at, mentions from messages where id = ${msgId}::uuid and sender_id = ${uid}`;
    if (!ex) {
      const [mu] = await sql`select muted_until from users where id = ${uid} and muted_until > now()`;
      if (mu) return Response.json({ error: "Kamu sedang dibisukan oleh moderator", muted: true }, { status: 403 });
      const [gm] = await sql`
        select muted_until from conversation_members
        where conversation_id = ${conversationId}::uuid and user_id = ${uid}
          and muted_until is not null and muted_until > now()`;
      if (gm) return Response.json({ error: "Kamu dibisukan di grup ini", muted: true, group: true }, { status: 403 });
      return new Response("Forbidden", { status: 403 });
    }
    return Response.json(ex);
  }
  const row = rows[0];

  // Balas klien secepat mungkin; siaran realtime + AI / away-reply setelah respons.
  after(async () => {
    // 1) Broadcast pesan user dulu
    const fanout = (async () => {
      try {
        const msg = await getMessage(row.id);
        await Promise.all([
          sql`update conversation_members set last_read_at = now() where conversation_id = ${conversationId} and user_id = ${uid}`,
          broadcast(conversationId, "message", msg),
        ]);
      } catch {}
    })();

    const [conv] = await sql`select kind from conversations where id = ${conversationId}`;

    // 2) Auto-balas "tidak di tempat" (hanya DM, lawan bicara sedang away)
    if (conv?.kind === "dm") {
      try {
        const DEFAULT_AWAY =
          "Halo,\nTerima kasih sudah menghubungi Kevsoft. Saat ini saya sedang tidak di tempat.\nPesan kamu akan saya balas segera setelah kembali online.";
        const others = await sql`
          select u.id, u.away_enabled, u.away_message, u.away_since
          from conversation_members cm
          join users u on u.id = cm.user_id
          where cm.conversation_id = ${conversationId} and cm.user_id <> ${uid}
            and coalesce(u.away_enabled, false) = true
            and not exists (select 1 from users x where x.id = u.id and x.muted_until > now())
          limit 1`;
        const other = others[0];
        if (other) {
          const since = other.away_since || new Date(0).toISOString();
          // Hindari spam: hanya satu auto-balas per sesi away (sejak away_since)
          const [dup] = await sql`
            select id from messages
            where conversation_id = ${conversationId}
              and sender_id = ${other.id}
              and created_at >= ${since}::timestamptz
              and kind = 'user'
            limit 1`;
          if (!dup) {
            const text = (String(other.away_message || "").trim() || DEFAULT_AWAY).slice(0, 500);
            const [ar] = await sql`
              insert into messages (conversation_id, sender_id, kind, body, expires_at)
              select ${conversationId}::uuid, ${other.id}, 'user', ${text},
                case when c.disappear_seconds > 0 then now() + make_interval(secs => c.disappear_seconds)
                     else now() + interval '1 day' end
              from conversations c where c.id = ${conversationId}::uuid
              returning id`;
            if (ar) await broadcast(conversationId, "message", await getMessage(ar.id));
          }
        }
      } catch {}
    }

    // 3) AI
    if (!(conv?.kind === "ai" || wantsAi)) {
      await fanout;
      return;
    }

    const prompt = aiPrompt(body);
    const rateP = sql`
      select count(*)::int as n from messages m join conversations c on c.id = m.conversation_id
      where m.sender_id = ${uid} and m.created_at > now() - interval '1 minute'
        and (c.kind = 'ai' or ${AI_HANDLE} = any(m.mentions))`;

    const answerP =
      !prompt
        ? Promise.resolve("Halo! Aku Kev-Ai. Tulis pertanyaanmu setelah @kev-ai, contoh: @kev-ai apa itu Next.js?")
        : askKevAi(prompt);

    const [[{ n }], answer0] = await Promise.all([rateP, answerP]);
    const answer =
      n > 8
        ? "Pelan-pelan ya, terlalu banyak pertanyaan dalam semenit. Coba lagi sebentar lagi."
        : answer0;

    const [r] = await sql`
      insert into messages (conversation_id, sender_id, kind, body, reply_to, expires_at)
      values (${conversationId}, null, 'ai', ${answer}, ${row.id}, now() + interval '1 day') returning id`;
    await Promise.all([fanout, broadcast(conversationId, "message", await getMessage(r.id))]);
  });

  return Response.json({ id: row.id, created_at: row.created_at, mentions: row.mentions });
}

// Hapus pesan. scope=all: hapus untuk semua (hanya pengirim). scope=me: sembunyikan hanya untuk diri sendiri.
export async function DELETE(req: Request) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const id = uuid.safeParse(sp.get("id"));
  if (!id.success) return new Response("Bad request", { status: 400 });

  // Owner biasa hanya boleh menindak pesan milik user biasa; owner utama (root) bebas.
  const actor = await getActor();
  const root = !!actor && actor.role === "owner" && isRootEmail(actor.email);

  // Owner/admin: hapus diam-diam (pesan hilang total, tanpa "telah dihapus")
  if (sp.get("scope") === "silent") {
    const [row] = await sql`
      delete from messages m
      where m.id = ${id.data}
        and exists (
          select 1 from users v left join users s on s.id = m.sender_id
          where v.id = ${uid} and v.role in ('admin', 'owner')
            and exists (select 1 from conversation_members where conversation_id = m.conversation_id and user_id = v.id)
            and (case v.role when 'owner' then 2 else 1 end) >= (case coalesce(s.role, 'user') when 'owner' then 2 when 'admin' then 1 else 0 end)
            and (v.role = 'owner' or coalesce(s.role, 'user') <> 'owner')
            and (${root} or v.role <> 'owner' or coalesce(s.role, 'user') = 'user'))
      returning m.id, m.conversation_id, m.sender_id`;
    if (!row) return new Response("Not found", { status: 404 });
    const [who] = await sql`select coalesce(username, name) as n from users where id = ${uid}`;
    const [tg] = await sql`select coalesce(username, name) as n from users where id = ${row.sender_id}`;
    await logMod({ actorId: uid, actorName: String(who?.n ?? "Staf"), action: "delete_message", targetId: row.sender_id, targetName: String(tg?.n ?? "user"), detail: "silent" });
    after(() => broadcast(row.conversation_id, "remove", { id: row.id, conversation_id: row.conversation_id }));
    return Response.json({ ok: true, silent: true });
  }

  if (sp.get("scope") === "all") {
    // Pengirim boleh menghapus pesannya sendiri. Staf (admin/owner) boleh menghapus pesan milik role di bawahnya.
    const [row] = await sql`
      update messages set body = '', mentions = '{}', deleted_at = now(), media_data = null, media_mime = null, media_name = null, poll_data = null
      where id = ${id.data} and deleted_at is null
        and (sender_id = ${uid} or exists (
          select 1 from users v left join users s on s.id = messages.sender_id
          where v.id = ${uid} and v.role in ('admin', 'owner')
            and exists (select 1 from conversation_members where conversation_id = messages.conversation_id and user_id = v.id)
            and (case v.role when 'owner' then 2 else 1 end) > (case coalesce(s.role, 'user') when 'owner' then 2 when 'admin' then 1 else 0 end)
          and (${root} or v.role <> 'owner' or coalesce(s.role, 'user') = 'user')))
      returning id, conversation_id, sender_id`;
    if (!row) return new Response("Not found", { status: 404 });
    if (row.sender_id !== uid) {
      const [who] = await sql`select coalesce(username, name) as n from users where id = ${uid}`;
      const [tg] = await sql`select coalesce(username, name) as n from users where id = ${row.sender_id}`;
      await logMod({ actorId: uid, actorName: String(who?.n ?? "Staf"), action: "delete_message", targetId: row.sender_id, targetName: tg?.n ?? "Kev-Ai" });
    }
    after(() => broadcast(row.conversation_id, "delete", { id: row.id, conversation_id: row.conversation_id }));
    return Response.json({ ok: true });
  }

  await sql`
    update messages m set hidden_by = array_append(m.hidden_by, ${uid})
    where m.id = ${id.data} and not (${uid} = any(m.hidden_by))
      and exists (select 1 from conversation_members where conversation_id = m.conversation_id and user_id = ${uid})`;
  return Response.json({ ok: true });
}

// Pin/unpin pesan, atau vote poll.
export async function PATCH(req: Request) {
  const uid = await getUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = z.object({
    id: uuid,
    action: z.enum(["pin", "unpin", "vote"]),
    option: z.number().int().min(0).max(9).optional(),
  }).safeParse(body);
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  const { id, action, option } = parsed.data;

  const [m] = await sql`
    select m.id, m.conversation_id, m.poll_data, m.pinned_at, c.kind, cm.role as member_role, v.role as sys_role
    from messages m
    join conversations c on c.id = m.conversation_id
    join conversation_members cm on cm.conversation_id = m.conversation_id and cm.user_id = ${uid}
    join users v on v.id = ${uid}
    where m.id = ${id} and m.deleted_at is null`;
  if (!m) return new Response("Not found", { status: 404 });

  if (action === "pin" || action === "unpin") {
    // DM/AI: kedua pihak. Grup: admin grup atau staf. Komunitas: hanya staf (anggota biasa tidak boleh menyematkan di ruang publik).
    const staff = m.sys_role === "admin" || m.sys_role === "owner";
    const can = m.kind === "dm" || m.kind === "ai" || staff || (m.kind === "group" && m.member_role === "admin");
    if (!can) return Response.json({ error: "Hanya admin yang bisa menyematkan pesan di sini" }, { status: 403 });
    await sql`update messages set pinned_at = ${action === "pin" ? new Date().toISOString() : null} where id = ${id}`;
    after(() => broadcast(m.conversation_id, "pin", { id, conversation_id: m.conversation_id, pinned: action === "pin" }));
    return Response.json({ ok: true, pinned: action === "pin" });
  }

  // vote
  if (option == null || !m.poll_data) return Response.json({ error: "Poll tidak valid" }, { status: 400 });
  const vr = await limit(`vote:${uid}`, 30, 60);
  if (!vr.ok) return tooMany(vr);
  // Satu statement atomik: dua orang memilih bersamaan tidak saling menimpa.
  const [upd] = await sql`
    update messages set poll_data = jsonb_set(poll_data, '{votes}', coalesce(poll_data->'votes', '{}'::jsonb) || jsonb_build_object(${uid}::text, ${option}::int))
    where id = ${id} and deleted_at is null and jsonb_typeof(poll_data->'options') = 'array'
      and ${option}::int < jsonb_array_length(poll_data->'options')
    returning poll_data`;
  if (!upd) return Response.json({ error: "Opsi tidak ada" }, { status: 400 });
  after(async () => broadcast(m.conversation_id, "message", await getMessage(id)));
  return Response.json({ ok: true, poll: upd.poll_data });
}
