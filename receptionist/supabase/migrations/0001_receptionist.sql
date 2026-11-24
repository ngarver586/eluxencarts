-- Eluxen Carts AI receptionist: calls, messages, booking attempts.
-- Row level security is on with no policies, so only the Edge Function's
-- secret key can read or write these tables.

create table if not exists public.receptionist_config (
  id          int primary key default 1 check (id = 1),
  config      jsonb not null,
  updated_at  timestamptz not null default now()
);

create table if not exists public.calls (
  call_id               text primary key,
  created_at            timestamptz not null default now(),
  from_number           text,
  to_number             text,
  direction             text,
  started_at            timestamptz,
  ended_at              timestamptz,
  duration_seconds      int,
  disconnection_reason  text,
  caller_name           text,
  reason_for_call       text,
  outcome               text,
  agent_summary         text,
  analysis              jsonb,
  transcript            text,
  recording_url         text,
  email_sent_at         timestamptz,
  email_status          text
);

create table if not exists public.messages (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  call_id           text not null,
  caller_name       text,
  callback_number   text,
  category          text not null default 'other',
  message           text not null,
  service_address   text,
  zip               text,
  cart              text,
  preferred_times   text,
  same_day_request  boolean not null default false,
  urgent            boolean not null default false
);
create index if not exists messages_call_id_idx on public.messages (call_id);

create table if not exists public.booking_attempts (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  call_id             text not null,
  status              text not null check (status in ('pending', 'booked', 'rejected', 'failed')),
  reason              text,
  service_key         text,
  service_name        text,
  start_at            timestamptz,
  end_at              timestamptz,
  price_cents         int,
  trip_fee_cents      int,
  customer_name       text,
  phone               text,
  zip                 text,
  address             jsonb,
  notes               text,
  square_env          text,
  square_customer_id  text,
  square_booking_id   text,
  details             jsonb
);
create index if not exists booking_attempts_call_id_idx on public.booking_attempts (call_id);
create index if not exists booking_attempts_start_idx on public.booking_attempts (start_at);

create table if not exists public.tool_calls (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  call_id     text,
  tool        text not null,
  args        jsonb,
  result      jsonb,
  ms          int
);
create index if not exists tool_calls_call_id_idx on public.tool_calls (call_id);

alter table public.receptionist_config enable row level security;
alter table public.calls              enable row level security;
alter table public.messages           enable row level security;
alter table public.booking_attempts   enable row level security;
alter table public.tool_calls         enable row level security;

-- Reserve a slot atomically so two simultaneous calls cannot book the same
-- time. Square's calendar remains the source of truth for older bookings;
-- this only guards the few seconds between our check and our write.
create or replace function public.claim_slot(
  p_call_id text,
  p_start timestamptz,
  p_end timestamptz,
  p_buffer_minutes int
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
  v_buffer interval := make_interval(mins => greatest(p_buffer_minutes, 0));
begin
  perform pg_advisory_xact_lock(48209311);
  if exists (
    select 1 from public.booking_attempts b
    where b.status in ('pending', 'booked')
      and b.created_at > now() - interval '3 minutes'
      and b.start_at < p_end + v_buffer
      and b.end_at > p_start - v_buffer
  ) then
    return null;
  end if;
  insert into public.booking_attempts (call_id, status, start_at, end_at)
  values (p_call_id, 'pending', p_start, p_end)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.claim_slot(text, timestamptz, timestamptz, int) from public, anon, authenticated;
grant execute on function public.claim_slot(text, timestamptz, timestamptz, int) to service_role;
