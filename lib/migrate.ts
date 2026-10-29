import { sql } from "./db";
import { SCHEMA } from "./schema";

// Membuat/upgrade tabel Neon otomatis (idempotent), cukup sekali per instance server.
let ready: Promise<void> | null = null;

// Neon 0.x: sql("..."), Neon 1.x: sql.query("...")
const runRaw = (q: string) => ((sql as any).query ? (sql as any).query(q) : (sql as any)(q));

async function run() {
  const [r] = await sql`
    select
      to_regclass('public.otp_codes') is not null as otp,
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'messages' and column_name = 'mentions') as mentions,
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'username') as username,
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'conversation_members' and column_name = 'last_read_at') as lastread,
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'messages' and column_name = 'deleted_at') as deleted,
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'conversation_members' and column_name = 'cleared_at') as cleared,
      to_regclass('public.user_avatars') is not null as avatars,
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'muted_until') as roles,
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'password_hash') as pw,
      to_regclass('public.mod_logs') is not null as modlogs,
      to_regclass('public.conversation_kicks') is not null as kicks,
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'conversations' and column_name = 'disappear_seconds') as disappear,
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'messages' and column_name = 'expires_at') as expires,
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'messages' and column_name = 'pinned_at') as pinned,
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'messages' and column_name = 'media_data') as media,
      to_regclass('public.app_settings') is not null as settings,
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'role_title') as role_title,
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'verified') as verified,
      to_regclass('public.user_banners') is not null as banners,
      to_regclass('public.rate_limits') is not null as ratelimits,
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'token_version') as tokenver,
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'away_enabled') as away,
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'conversations' and column_name = 'avatar_url') as group_avatar`;
  if (!(r.otp && r.mentions && r.username && r.lastread && r.deleted && r.cleared && r.avatars && r.roles && r.pw && r.modlogs && r.kicks && r.disappear && r.expires && r.pinned && r.media && r.settings && r.role_title && r.verified && r.banners && r.ratelimits && r.tokenver && r.away && r.group_avatar)) {
    for (const s of SCHEMA.split(";").map((x) => x.trim()).filter(Boolean)) await runRaw(s);
  }
  // Pastikan pembuat grup = owner grup (bukan admin sistem)
  try {
    await sql`
      update conversation_members cm
      set role = 'owner'
      from conversations c
      where c.id = cm.conversation_id
        and c.kind = 'group'
        and c.created_by is not null
        and c.created_by = cm.user_id
        and cm.role is distinct from 'owner'`;
  } catch {}
}

export function ensureSchema() {
  ready ??= run().catch((e) => { ready = null; throw e; });
  return ready;
}
