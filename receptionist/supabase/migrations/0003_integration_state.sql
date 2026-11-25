-- IDs the receptionist gets back from outside services (for example the
-- Retell LLM and agent IDs), so a later sync updates them instead of
-- creating duplicates. No secrets are stored here.
create table if not exists public.integration_state (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.integration_state enable row level security;
