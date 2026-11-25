-- Short-lived tokens for the sandbox-only /selftest route, which runs the
-- voice agent's tools without a phone call. Create one in the SQL editor:
--   insert into public.selftest_tokens default values;
-- The function refuses /selftest entirely when SQUARE_ENV is production.
create table if not exists public.selftest_tokens (
  token uuid primary key default gen_random_uuid(),
  expires_at timestamptz not null default now() + interval '2 hours',
  created_at timestamptz not null default now()
);

alter table public.selftest_tokens enable row level security;
