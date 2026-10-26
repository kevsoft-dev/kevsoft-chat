create extension if not exists pgcrypto;

create table if not exists users (
  id text primary key,
  email text unique,
  name text,
  avatar_url text,
  created_at timestamptz default now()
);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  is_group boolean default false,
  title text,
  created_at timestamptz default now()
);

create table if not exists conversation_members (
  conversation_id uuid references conversations(id) on delete cascade,
  user_id text references users(id) on delete cascade,
  primary key (conversation_id, user_id)
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  sender_id text references users(id),
  body text not null check (length(body) <= 4000),
  created_at timestamptz default now()
);
create index if not exists messages_conv_idx on messages (conversation_id, created_at desc);

create table if not exists otp_codes (
  email text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int default 0,
  sent_at timestamptz default now()
);
