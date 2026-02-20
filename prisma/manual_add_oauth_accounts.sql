-- Manual migration: OAuth provider account linking
-- Safe to run once in Supabase SQL editor.

create table if not exists public.oauth_accounts (
  id bigserial primary key,
  user_id bigint not null references public.users(id) on delete cascade,
  provider varchar(32) not null,
  provider_account_id varchar(255) not null,
  email varchar(255),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint oauth_accounts_provider_provider_account_key unique (provider, provider_account_id)
);

create index if not exists idx_oauth_accounts_user_id on public.oauth_accounts (user_id);
create index if not exists idx_oauth_accounts_email on public.oauth_accounts (email);
