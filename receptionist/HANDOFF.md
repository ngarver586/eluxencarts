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
  `e237031e1c5d15b317fedba36b958116fbb60a52`. To ship code changes: commit,
  push, redeploy the entry point with the new commit ID (Supabase MCP
  `deploy_edge_function`, `verify_jwt: false`), or deploy the folder with
  the Supabase CLI.
- 32 Deno tests pass (`deno task test`). They use in-memory stand-ins. Real
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

## Blocked right now

The Square sandbox seller is **not onboarded to Appointments**. Every
Bookings call returns `401 Merchant not onboarded to Appointments`, and the
sandbox catalog has no appointment services.

Next action, in the browser:

1. https://developer.squareup.com/apps, **Sandbox test accounts**, Default
   Test Account, **Open in Square Dashboard**.
2. If **Appointments** is in the left menu: Get started, then create
   `Maintenance` (variations `Electric cart` $189 and `Gas cart` $219, 90
   min), `Diagnostic or lithium battery check` ($99, 60 min), `Signature
   detail` (variation `4-seat`, $149, 120 min). Make the owner bookable and
   assign the services. Start the **Plus** plan with Square's sandbox test
   card `4111 1111 1111 1111`, CVV `111`, expiry `12/40`.
3. If Appointments is missing or redirects to a marketing page: stop. This
   is a known sandbox limitation. Fallback already agreed with Nick: a
   second, free Square account used only for testing, with a Plus trial.
   Then `SQUARE_ENV=production` with that test account's token.

Never touch Nick's real Square account until he says so (Phase 2).

## Then, in order

1. Verify Square: business booking profile shows
   `support_seller_level_writes: true`, services match `business.yaml`.
   Run each tool against the test account before any voice work. Check
   whether Square's availability already respects blocked time, and whether
   `location_type: CUSTOMER_LOCATION` with an address is accepted.
2. Secrets in Supabase (Dashboard, Edge Functions, Secrets), entered by
   Nick: `SQUARE_ACCESS_TOKEN`, `RETELL_API_KEY`, `RESEND_API_KEY`. Then
   `GET /health` should show `square_ok: true`.
3. Retell: Nick creates the account. Add a step to `scripts/sync.ts` that
   creates or updates the Retell LLM and agent from `dist/retell-llm.json`
   and sets the agent webhook to `.../receptionist/webhook`. Check Retell's
   current API docs first. Test with free web calls before buying a number.
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
