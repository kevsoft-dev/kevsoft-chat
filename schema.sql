create extension if not exists pgcrypto;

create table if not exists users (
  id text primary key,
  email text unique,
  name text,
  avatar_url text,
  created_at timestamptz default now()
);
alter table users add column if not exists username text;
alter table users add column if not exists bio text;
create unique index if not exists users_username_key on users (lower(username));

create table if not exists user_avatars (
  user_id text primary key references users(id) on delete cascade,
  mime text not null,
  data text not null,
  updated_at timestamptz not null default now()
);
alter table users add column if not exists banner_url text;
create table if not exists user_banners (
  user_id text primary key references users(id) on delete cascade,
  mime text not null,
  data text not null,
  updated_at timestamptz not null default now()
);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  title text,
  created_at timestamptz default now()
);
alter table conversations add column if not exists kind text not null default 'dm';
alter table conversations add column if not exists description text;
alter table conversations add column if not exists rules text;
alter table conversations add column if not exists invite_code text;
update conversations set invite_code = translate(encode(gen_random_bytes(12), 'base64'), '+/', '-_') where kind = 'group' and invite_code is null;
create unique index if not exists conversations_invite_code_key on conversations (invite_code) where invite_code is not null;
alter table conversations add column if not exists created_by text;
alter table conversations add column if not exists disappear_seconds int not null default 0;
create unique index if not exists conversations_one_ai_per_user on conversations (created_by) where kind = 'ai';

create table if not exists conversation_members (
  conversation_id uuid references conversations(id) on delete cascade,
  user_id text references users(id) on delete cascade,
  primary key (conversation_id, user_id)
);
alter table conversation_members add column if not exists role text not null default 'member';
alter table conversation_members add column if not exists last_read_at timestamptz not null default now();
alter table conversation_members add column if not exists joined_at timestamptz not null default now();
alter table conversation_members add column if not exists cleared_at timestamptz;
alter table conversation_members add column if not exists hidden_at timestamptz;
create index if not exists members_user_idx on conversation_members (user_id);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  sender_id text references users(id),
  body text not null check (length(body) <= 4000),
  created_at timestamptz default now()
);
alter table messages add column if not exists kind text not null default 'user';
alter table messages add column if not exists reply_to uuid references messages(id) on delete set null;
alter table messages add column if not exists mentions text[] not null default '{}';
alter table messages add column if not exists deleted_at timestamptz;
alter table messages add column if not exists hidden_by text[] not null default '{}';
alter table messages add column if not exists expires_at timestamptz;
alter table messages add column if not exists pinned_at timestamptz;
alter table messages add column if not exists media_mime text;
alter table messages add column if not exists media_data text;
alter table messages add column if not exists media_name text;
alter table messages add column if not exists poll_data jsonb;
create index if not exists messages_conv_idx on messages (conversation_id, created_at desc);
create index if not exists messages_expires_idx on messages (expires_at) where expires_at is not null;

create table if not exists otp_codes (
  email text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int default 0,
  sent_at timestamptz default now()
);

alter table users add column if not exists role text not null default 'user';
alter table users add column if not exists password_hash text;
alter table users add column if not exists banned_at timestamptz;
alter table users add column if not exists ban_reason text;
alter table users add column if not exists muted_until timestamptz;
alter table users add column if not exists login_fails int not null default 0;
alter table users add column if not exists locked_until timestamptz;

create table if not exists conversation_kicks (
  conversation_id uuid references conversations(id) on delete cascade,
  user_id text references users(id) on delete cascade,
  kicked_by text,
  created_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists mod_logs (
  id bigserial primary key,
  actor_id text,
  actor_name text,
  action text not null,
  target_id text,
  target_name text,
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists mod_logs_created_idx on mod_logs (created_at desc);

insert into conversations (id, kind, title, description)
values ('00000000-0000-4000-8000-000000000001', 'community', 'Komunitas Kevsoft', 'Tempat ngobrol publik semua member kevsoft. Tag teman dengan @username, tanya AI dengan @kev-ai.')
on conflict (id) do nothing;

create table if not exists app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
insert into app_settings (key, value) values
  ('role_owner', 'Owner'),
  ('role_admin', 'Admin'),
  ('role_user', 'Member')
on conflict (key) do nothing;

alter table users add column if not exists role_title text;
alter table users add column if not exists verified boolean not null default false;

alter table users add column if not exists token_version int not null default 0;
create table if not exists rate_limits (
  key text primary key,
  count int not null default 0,
  reset_at timestamptz not null
);
create index if not exists rate_limits_reset_idx on rate_limits (reset_at);
create index if not exists messages_sender_idx on messages (sender_id, created_at desc);


-- Linked devices / multi-session (seperti WhatsApp Linked Devices)
alter table users add column if not exists developer_mode boolean not null default false;

create table if not exists linked_devices (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(id) on delete cascade,
  session_jti text,                       -- JWT jti jika ada
  device_name text not null default 'Perangkat',
  device_type text not null default 'web', -- web | mobile | desktop | tablet
  user_agent text,
  ip text,
  last_active timestamptz not null default now(),
  created_at timestamptz not null default now(),
  current boolean not null default false
);
create index if not exists linked_devices_user_idx on linked_devices (user_id, last_active desc);

-- API keys per-user (hanya aktif jika developer_mode = true)
create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(id) on delete cascade,
  name text not null default 'Default',
  key_prefix text not null,               -- 8 karakter pertama untuk tampilan
  key_hash text not null,                 -- sha256
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create unique index if not exists api_keys_hash_idx on api_keys (key_hash) where revoked_at is null;
create index if not exists api_keys_user_idx on api_keys (user_id) where revoked_at is null;
