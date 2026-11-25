# Handoff: Eluxen Carts AI receptionist

State as of 2026-11-25. Read this, then `README.md`, `business.yaml` and
`TEST_CALLS.md` in this folder. The original brief's decisions still hold
except where "Decisions since the brief" below says otherwise.

## Where things are

- Branch `claude/gallant-dirac-ax4w9p` of `ngarver586/eluxencarts`, folder
  `receptionist/`. Not merged to `main` and should stay unmerged (this repo
  is the public website).
- Supabase project `eluxen-receptionist`, ref `wvvwkpykosiudltuvjnw`,
  us-east-1. Migration applied. Config row loaded from `business.yaml`.
- Edge Function `receptionist` is deployed with JWT verification off (it
  checks the Retell signature itself):
  `https://wvvwkpykosiudltuvjnw.supabase.co/functions/v1/receptionist`
  (`/tool`, `/webhook`, `/health`).
- The deployed entry point imports `lib/app.ts` and `lib/db.ts` from
  raw.githubusercontent.com at commit
  `a6bb4975f359e891687667c40d46c16d7310a7cb` (function version 2). To ship code changes: commit,
  push, redeploy the entry point with the new commit ID (Supabase MCP
  `deploy_edge_function`, `verify_jwt: false`), or deploy the folder with
  the Supabase CLI.
- 34 Deno tests pass (`deno task test`). They use in-memory stand-ins. Real
  Square has not been exercised beyond read-only checks.

## Done

- Research and platform pick: Retell AI for voice, Resend for email.
- Backend: six tools (`get_services`, `check_service_area`,
  `find_open_slots`, `create_booking`, `take_message`, `end_call_summary`),
  Square client, booking rules, call summary email, logging tables.
- `scripts/sync.ts` validates `business.yaml`, writes `dist/` (config,
  prompt, Retell LLM JSON) and pushes the config to Supabase.
- Square developer app `Eluxen Receptionist` exists. Its sandbox access
  token works for `/v2/locations` (location `LVEYJA6Z2NS08`, "Default Test
  Account").

## Square sandbox: Appointments is set up (2026-11-25)

Done in the sandbox Square Dashboard (Default Test Account, location
`LVEYJA6Z2NS08`). Nick's real Square account was not touched.

- Appointments onboarded on the **Plus** trial. No card was asked for.
- Services created: `Maintenance` (`Electric cart` $189, `Gas cart` $219,
  90 min), `Diagnostic or lithium battery check` ($99, 60 min), `Signature
  detail` (`4-seat`, $149, 120 min). Square's four sample salon services are
  still there on purpose: they prove the allowlist hides them.
- The owner ("Sandbox Seller") is bookable with all services assigned.
- A personal event with "Block time" on sits on Fri 2026-11-27, 1 to 2 PM,
  to check whether Square's availability respects blocked time.
- Sandbox calendar hours look like Mon to Fri from 9 AM. The real account
  must be open 9 AM to 7 PM every day or the AI will offer fewer times
  than `business.yaml` allows.

## Blocked right now

Nick has to put the **sandbox** access token into Supabase as
`SQUARE_ACCESS_TOKEN` (Dashboard, Edge Functions, Secrets). Nothing can be
verified against Square until then. `/health` currently shows
`square_token_set: false`.

## Testing without a phone call: `/selftest`

`POST .../receptionist/selftest` runs the same six tools without Retell.
Body: `{"name": "<tool>", "args": {...}, "call": {"call_id": "a"}}`, or
`{"name": "diagnostics"}` for what Square returns next to how
`business.yaml` matched it. It is refused when `SQUARE_ENV=production` and
needs a live row in `selftest_tokens` (2 hour expiry) sent as
`x-selftest-token`. The session's shell cannot reach supabase.co, so call it
from SQL with the `http` extension and keep the token inside the database:

```sql
insert into public.selftest_tokens default values;
select status, content from extensions.http((
  'POST',
  'https://wvvwkpykosiudltuvjnw.supabase.co/functions/v1/receptionist/selftest',
  array[extensions.http_header('x-selftest-token',
    (select token::text from public.selftest_tokens order by created_at desc limit 1))],
  'application/json',
  '{"name":"diagnostics"}'
)::extensions.http_request);
```

## Retell wiring is built, waiting on the account (2026-11-25)

`POST .../receptionist/admin/retell-sync` creates the Retell LLM and agent
the first time and updates them after that, using `RETELL_API_KEY` from
Supabase secrets. The IDs are kept in the `integration_state` table. It
takes the same `x-selftest-token` header as `/selftest` and also works in
production. Body: the contents of `dist/retell-sync.json`, or
`{"op":"voices"}` to list voice IDs. `deno task sync` calls it when run with
a Supabase secret key. From a cloud session, run
`deno run ... scripts/sync.ts --dry-run`, then POST `dist/retell-sync.json`
from SQL the same way as the selftest example above (set
`select extensions.http_set_curlopt('CURLOPT_TIMEOUT', '30')` first).

Voice settings live under `voice:` in `business.yaml`. `voice_id` is still
the docs' example voice (`retell-Cimo`); list voices and let Nick pick.
The agent is left as a draft. Retell says draft versions can be attached to
phone numbers and tested in the dashboard. Not yet exercised against the
real Retell API: field names follow the docs as of today.

Retell signs tool calls and webhooks with the API key that has the webhook
badge in its dashboard. That is the key Nick must put in Supabase.

Deno tests in a cloud session: jsr.io is blocked, so map
`jsr:@std/assert@1` to a local shim with `--import-map` and `--no-lock`.

## Then, in order

1. Verify Square with `/selftest` once the token is in: business booking profile shows
   `support_seller_level_writes: true`, services match `business.yaml`.
   Run each tool against the test account before any voice work. Check
   whether Square's availability already respects blocked time, and whether
   `location_type: CUSTOMER_LOCATION` with an address is accepted.
2. Secrets in Supabase (Dashboard, Edge Functions, Secrets), entered by
   Nick: `SQUARE_ACCESS_TOKEN`, `RETELL_API_KEY`, `RESEND_API_KEY`. Then
   `GET /health` should show `square_ok: true`.
3. Retell: Nick creates the account and adds `RETELL_API_KEY`. Run the
   retell-sync (see above), fix whatever the real API rejects, then test
   with free web calls in the Retell dashboard before buying a number.
   Ask before the number purchase ($2 a month, needs Retell's ID check).
4. Resend: Nick creates the account and adds its DNS records at Namecheap
   (DNS host). Current DNS: MX is Namecheap Private Email, apex SPF is
   `v=spf1 include:spf.privateemail.com ~all`, no DMARC. Do not change the
   apex MX or SPF. Suggest a `_dmarc` record of `v=DMARC1; p=none`.
5. Run `TEST_CALLS.md` with Nick.
6. Phase 2 (production Square) and Phase 3 (Google Voice) only on Nick's
   say-so. Google Voice is a paid account; exact plan not yet confirmed.

## Decisions since the brief

- Buffer is **30 minutes** before and after (was 45). Only times Square
  lists as open are offered, with the buffer applied on top.
- Trip fee: **$50 when the service ZIP is more than 10 straight-line miles
  from the center of 32081**. Bookable cities unchanged. ZIP table and
  overrides are described in `README.md`.
- Same-day: never booked. If the caller insists, take a message flagged
  `same_day_request`, no guarantee.
- Separate Supabase project for the receptionist. Code lives in
  `receptionist/` on this branch.
- Greeting wording in `business.yaml` still needs Nick's approval.

## Things research turned up that still need a real-world check

- Square docs say API-created bookings send the customer no email or SMS.
  A Square staff forum reply (2026-11-17) says SMS is sent. Confirm with the
  Phase 2 test booking.
- Square does not reject double bookings for a personal access token. Our
  code is the only guard.
- The API is only included in Square Plus ($49 a month per location). On
  Free, booking writes return 403 and the code drops to request mode.
- Consumer-style Google Voice cannot ring Nick first and then fall through
  to another number. Likely Phase 3 design: a Twilio number as the only
  forwarding target, which rings Nick's cell 15 seconds with "press 1",
  then hands off to the Retell agent.

## Rules that still apply

- Never print, commit, or ask Nick to paste a secret into chat.
- Stop and ask before any purchase, anything in production Square, and
  anything customers could see or hear.
- Customer-facing wording: plain English, no em dashes.
