-- bulbapedia-mcp: accounts, per-user API tokens, usage tracking.
-- Run once in the Supabase SQL editor (or psql). Idempotent.

create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  google_sub text unique not null,
  email text unique not null,
  name text,
  avatar_url text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text unique not null,          -- sha256 of the cookie value
  user_agent text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index if not exists sessions_user_id_idx on sessions (user_id);

create table if not exists api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  token_hash text unique not null,          -- sha256 of the "bp_..." token
  token_prefix text not null,               -- first 10 characters, for display only
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists api_tokens_user_id_idx on api_tokens (user_id);

create table if not exists usage_events (
  id bigint generated always as identity primary key,
  user_id uuid references users(id) on delete set null,
  token_id uuid references api_tokens(id) on delete set null,
  tool text not null,
  args jsonb,
  ok boolean not null,
  error text,
  duration_ms integer,
  created_at timestamptz not null default now()
);
create index if not exists usage_events_user_created_idx on usage_events (user_id, created_at desc);
create index if not exists usage_events_created_idx on usage_events (created_at desc);
create index if not exists usage_events_tool_idx on usage_events (tool);
create index if not exists usage_events_token_idx on usage_events (token_id);
