import { sql } from "./db";
import { SCHEMA } from "./schema";

// Membuat/upgrade tabel Neon otomatis (idempotent), cukup sekali per instance server.
let ready: Promise<void> | null = null;

async function run() {
  const [r] = await sql`
    select
      to_regclass('public.otp_codes') is not null as otp,
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'messages' and column_name = 'mentions') as mentions,
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'username') as username,
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'conversation_members' and column_name = 'last_read_at') as lastread`;
  if (r.otp && r.mentions && r.username && r.lastread) return;
  for (const s of SCHEMA.split(";").map((x) => x.trim()).filter(Boolean)) await sql.query(s);
}

export function ensureSchema() {
  ready ??= run().catch((e) => { ready = null; throw e; });
  return ready;
}
