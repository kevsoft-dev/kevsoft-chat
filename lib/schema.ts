// Salinan schema.sql, dipakai untuk membuat tabel otomatis.
export const SCHEMA = `
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

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  title text,
  created_at timestamptz default now()
);
alter table conversations add column if not exists kind text not null default 'dm';
alter table conversations add column if not exists description text;
alter table conversations add column if not exists created_by text;
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
create index if not exists messages_conv_idx on messages (conversation_id, created_at desc);

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
on conflict (id) do nothing
`;
