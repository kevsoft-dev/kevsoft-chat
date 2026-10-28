import { clientIp, limit, tooMany } from "@/lib/ratelimit";
import { z } from "zod";
import { sql } from "@/lib/db";
import { forgetBan, getActor } from "@/lib/auth";
import { logMod } from "@/lib/audit";
import { COMMUNITY_ID } from "@/lib/mentions";
import { pushTo } from "@/lib/messages";
import { canManage, isRootEmail, rank, userIdForEmail } from "@/lib/roles";

const deny = (m = "Tidak diizinkan", s = 403) => Response.json({ error: m }, { status: s });

// Daftar pengguna untuk Console (owner & admin). Email hanya terlihat oleh owner.
export async function GET(req: Request) {
  const me = await getActor();
  if (!me) return new Response("Unauthorized", { status: 401 });
  if (rank(me.role) < 1) return deny();

  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") ?? "").trim().toLowerCase().slice(0, 40);
  const filter = ["all", "staff", "banned", "muted"].includes(sp.get("filter") ?? "") ? (sp.get("filter") as string) : "all";
  const off = Math.max(0, Math.min(10_000, Number(sp.get("offset")) || 0));
  const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;

  const [rows, [stats]] = await Promise.all([
    sql`
      select id, username, name, email, avatar_url, role, role_title, verified, banned_at, ban_reason, muted_until, created_at,
        (password_hash is not null) as has_password,
        exists (select 1 from conversation_kicks k where k.conversation_id = ${COMMUNITY_ID}::uuid and k.user_id = users.id) as kicked
      from users
      where (${q} = '' or lower(coalesce(username, '')) like ${like} or lower(coalesce(name, '')) like ${like} or lower(coalesce(email, '')) like ${like})
        and (${filter} = 'all'
          or (${filter} = 'staff' and role in ('admin', 'owner'))
          or (${filter} = 'banned' and banned_at is not null)
          or (${filter} = 'muted' and muted_until > now()))
      order by (role = 'owner') desc, (role = 'admin') desc, created_at desc
      limit 51 offset ${off}`,
    sql`
      select count(*)::int as total,
        (count(*) filter (where banned_at is not null))::int as banned,
        (count(*) filter (where muted_until > now()))::int as muted,
        (count(*) filter (where role = 'owner'))::int as owners,
        (count(*) filter (where role = 'admin'))::int as admins
      from users`,
  ]);

  const more = rows.length > 50;
  const users = rows.slice(0, 50).map((u) => ({
    id: u.id, username: u.username, name: u.name, avatar_url: u.avatar_url, role: u.role, role_title: u.role_title ?? null,
    verified: u.role === "owner" || !!u.verified,
    email: rank(me.role) === 2 ? u.email : null,
    banned: !!u.banned_at, ban_reason: u.ban_reason, muted_until: u.muted_until, created_at: u.created_at,
    has_password: u.has_password, kicked: u.kicked, root: isRootEmail(u.email),
    can_manage: canManage(me, { id: u.id, role: u.role, email: u.email }),
  }));
  return Response.json({ users, more, stats });
}

const userId = z.string().min(1).max(64);
const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ban"), userId, reason: z.string().trim().max(200).optional() }),
  z.object({ action: z.literal("unban"), userId }),
  z.object({ action: z.literal("mute"), userId, minutes: z.number().int().min(1).max(60 * 24 * 30) }),
  z.object({ action: z.literal("unmute"), userId }),
  z.object({ action: z.literal("role"), userId, role: z.enum(["user", "admin", "owner"]), title: z.string().trim().max(24).optional() }),
  z.object({ action: z.literal("title"), userId, title: z.string().trim().max(24) }),
  z.object({ action: z.literal("verify"), userId, verified: z.boolean() }),
  z.object({ action: z.literal("grant"), email: z.string().trim().toLowerCase().email().max(254), role: z.enum(["admin", "owner"]) }),
  z.object({ action: z.literal("rejoin"), userId }),
  z.object({ action: z.literal("reset_password"), userId }),
]);

export async function POST(req: Request) {
  const me = await getActor();
  if (!me) return new Response("Unauthorized", { status: 401 });
  if (rank(me.role) < 1) return deny();
  const rl = await limit(`adm:${me.id}`, 60, 60);
  if (!rl.ok) return tooMany(rl);
  const parsed(await req.json().catch(() => null));
  if (!parsed.success) return deny("Data tidak valid", 400);
  const d = parsed.data;
  const isOwner = rank(me.role) === 2;
  const log = (action: string, t: { id: string; name: string }, detail?: string) =>
    logMod({ actorId: me.id, actorName: me.name, action, targetId: t.id, targetName: t.name, detail });

  // Tambah owner/admin lewat email (boleh sebelum orangnya mendaftar). Hanya owner.
  if (d.action === "grant") {
    if (!isOwner) return deny("Hanya owner yang bisa menambah staf");
    if (isRootEmail(d.email)) return Response.json({ ok: true });
    const [ex] = await sql`select id, role, email, username, name from users where email = ${d.email}`;
    if (ex) {
      if (!canManage(me, { id: ex.id, role: ex.role, email: ex.email })) return deny("Tidak bisa mengubah role akun ini");
      await sql`update users set role = ${d.role} where id = ${ex.id}`;
      await pushTo(ex.id, "role", { role: d.role });
      await log(`role:${d.role}`, { id: ex.id, name: ex.username || ex.email });
    } else {
      const id = userIdForEmail(d.email);
      await sql`
        insert into users (id, email, name, role) values (${id}, ${d.email}, ${d.email.split("@")[0]}, ${d.role})
        on conflict (email) do update set role = excluded.role`;
      await log(`role:${d.role}`, { id, name: d.email }, "ditambahkan lewat email");
    }
    return Response.json({ ok: true });
  }

  const [t] = await sql`select id, role, email, username, name, verified from users where id = ${d.userId}`;
  if (!t) return deny("Pengguna tidak ditemukan", 404);
  const target = { id: t.id as string, role: String(t.role), email: (t.email as string | null) ?? null };
  if (!canManage(me, target)) return deny("Kamu tidak bisa menindak akun ini");
  const tn = { id: t.id as string, name: String(t.username || t.name || t.email || t.id) };

  switch (d.action) {
    case "ban": {
      await sql`update users set banned_at = now(), ban_reason = ${d.reason || null}, muted_until = null, token_version = token_version + 1 where id = ${t.id}`;
      forgetBan(t.id);
      await pushTo(t.id, "banned", { reason: d.reason ?? null });
      await log("ban", tn, d.reason || undefined);
      break;
    }
    case "unban": {
      await sql`update users set banned_at = null, ban_reason = null, login_fails = 0, locked_until = null where id = ${t.id}`;
      forgetBan(t.id);
      await log("unban", tn);
      break;
    }
    case "mute": {
      await sql`update users set muted_until = now() + (${d.minutes}::int * interval '1 minute') where id = ${t.id}`;
      await pushTo(t.id, "muted", { minutes: d.minutes });
      await log("mute", tn, `${d.minutes} menit`);
      break;
    }
    case "unmute": {
      await sql`update users set muted_until = null where id = ${t.id}`;
      await log("unmute", tn);
      break;
    }
    case "role": {
      if (!isOwner) return deny("Hanya owner yang bisa mengubah role");
      const title = "title" in d && d.title ? String(d.title).trim() || null : null;
      await sql`update users set role = ${d.role}, role_title = coalesce(${title}, role_title) where id = ${t.id}`;
      await pushTo(t.id, "role", { role: d.role, title, verified: d.role === "owner" || !!t.verified });
      await log(`role:${d.role}`, tn, title ? `title:${title}` : `sebelumnya ${t.role}`);
      break;
    }
    case "title": {
      if (!isOwner) return deny("Hanya owner yang bisa mengubah sebutan");
      const title = d.title.trim() || null;
      await sql`update users set role_title = ${title} where id = ${t.id}`;
      await pushTo(t.id, "role", { role: t.role, title, verified: t.role === "owner" || !!t.verified });
      await log("role_title", tn, title || "dihapus");
      break;
    }
    case "verify": {
      if (!isOwner) return deny("Hanya owner yang bisa memberi centang biru");
      await sql`update users set verified = ${d.verified} where id = ${t.id}`;
      await pushTo(t.id, "role", { role: t.role, verified: d.verified || t.role === "owner" });
      await log(d.verified ? "verify" : "unverify", tn, "centang biru");
      break;
    }
    case "rejoin": {
      await sql`delete from conversation_kicks where conversation_id = ${COMMUNITY_ID}::uuid and user_id = ${t.id}`;
      if (t.username)
        await sql`insert into conversation_members (conversation_id, user_id) values (${COMMUNITY_ID}::uuid, ${t.id}) on conflict do nothing`;
      await pushTo(t.id, "conversation", { id: COMMUNITY_ID });
      await log("rejoin", tn, "Komunitas Kevsoft");
      break;
    }
    case "reset_password": {
      if (!isOwner) return deny("Hanya owner yang bisa mereset password");
      await sql`update users set password_hash = null, login_fails = 0, locked_until = null, token_version = token_version + 1 where id = ${t.id}`;
      forgetBan(t.id);
      await log("reset_password", tn);
      break;
    }
  }
  return Response.json({ ok: true });
}
