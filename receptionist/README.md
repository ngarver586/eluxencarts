# Eluxen Carts AI phone receptionist

Answers the business line when Nick can't, books fixed-price services into
Square Appointments, takes a message for everything else, and emails a
summary with the transcript after every call.

**Status: Phase 1 in progress.** The backend is built, tested against
stand-ins, and deployed. It is not yet connected to Square, to a phone
number, or to email. See "What each phase needs from Nick".

## How it fits together

```
Caller -> Retell AI (voice, phone number, recording, transcript)
            |  tool calls during the call        |  call events after the call
            v                                    v
       Supabase Edge Function "receptionist" (this folder)
            |                |                   |
            v                v                   v
     Square Appointments   Supabase Postgres   Resend (summary email)
     (services, calendar,  (calls, messages,
      customers, bookings)  booking attempts)
```

- Supabase project: `eluxen-receptionist` (`wvvwkpykosiudltuvjnw`), separate
  from the cartfol.io project.
- Function URL: `https://wvvwkpykosiudltuvjnw.supabase.co/functions/v1/receptionist`
  - `POST /tool` tool calls from the voice agent
  - `POST /webhook` call events
  - `GET /health` shows what is configured. It never shows a key.
- Every `/tool` and `/webhook` request must carry a valid Retell signature.
  Anything else is refused.

## The rules it enforces in code

These do not depend on the AI behaving. The backend refuses to break them.

| Rule | Where it is set |
|---|---|
| Never same-day. Tomorrow at the earliest. | `booking.earliest_days_ahead` |
| Appointments start at or after 9 AM and end by 7 PM Eastern | `hours` |
| 30 minutes clear before and after every existing appointment | `booking.buffer_minutes` |
| Only times Square itself lists as open | always |
| The calendar is re-checked immediately before every booking | always |
| Two calls cannot book the same slot | always |
| Books only after the caller confirmed the read-back | always |
| Only services on the allowlist, at Square's price | `services` |
| Only addresses in the service area | `service_area` |
| If the Square plan does not allow API bookings, it books nothing and collects preferred times instead ("request mode") | automatic |

Square does **not** stop double bookings for this kind of app, so these
checks are the only guard. Every attempt, allowed or refused, is logged in
the `booking_attempts` table.

### Trip charge

$50 when the service ZIP is more than 10 straight-line miles from the center
of 32081. Only the cities listed under `service_area.cities` are bookable.
Today that works out to:

- No charge: 32081, 32082, 32004 (Ponte Vedra), 32259 (St. Johns), 32095
  (north St. Augustine), 32258 (Jacksonville, Bartram Park)
- $50: every other Jacksonville, Jacksonville Beach and St. Augustine ZIP
- Message only: everywhere else, including Neptune Beach, Atlantic Beach,
  Orange Park and Fleming Island

To change one ZIP, add it to `service_area.zip_overrides` as `free`, `fee`
or `no`.

## Changing prices and rules

Everything lives in one file: [`business.yaml`](business.yaml). Hours, the
buffer, the service area, which services the AI may book, the battery price
table, the facts it may share, the greeting, and how it talks.

Prices of bookable services are **not** in that file. They come from Square
on every call. The `expect_price` values are a cross-check only: if Square
disagrees, the AI quotes Square's price and the mismatch is listed at the
bottom of your summary email.

After editing:

```bash
cd receptionist
```

```bash
deno task sync
```

That validates the file and pushes it. Rule changes are live within a
minute. It needs [Deno](https://deno.com) and a `.env` file (copy
`.env.example`, add the Supabase secret key from Project Settings, API
Keys). Or ask Claude Code to "sync the receptionist config".

The same command also updates the voice agent in Retell (greeting,
instructions, facts, service list, voice). The Retell key never leaves
Supabase: the sync asks the backend to make the change.

## Turning the receptionist off fast

Fastest first:

1. **Stop the AI answering (seconds).** Retell dashboard, Phone Numbers,
   select the number, set a Fallback Number (your cell), turn on **Backup
   mode**. New calls go straight to your cell. Turn it off to resume.
2. **Stop it booking, keep it answering (about a minute).** Set
   `booking.enabled: false` in `business.yaml` and run `deno task sync`. It
   takes messages only.
3. **Phase 3 only: take it out of the call path.** In Google Voice, turn
   off forwarding to the AI number. Callers get your normal voicemail.

## Secrets

All keys live in Supabase (Dashboard, Edge Functions, Secrets) and nowhere
else. Never paste a key into chat or commit one.

| Secret | Used for | Phase |
|---|---|---|
| `SQUARE_ACCESS_TOKEN` | Square API | 1 (sandbox token), 2 (production token) |
| `SQUARE_ENV` | `sandbox` or `production`. Defaults to `sandbox`. | 2 |
| `RETELL_API_KEY` | Verifying that requests come from Retell | 1 |
| `RESEND_API_KEY` | Sending the summary email | 1 |
| `SQUARE_LOCATION_ID`, `SQUARE_TEAM_MEMBER_ID` | Optional. Only needed if Square has more than one location or bookable person. | 2 |

## What each phase needs from Nick

### Phase 1: direct dial, test Square account

1. Create the Square developer app and a test token (steps come in chat).
2. Create the Retell account and buy the number when asked.
3. Create the Resend account and add three DNS records at Namecheap.
4. Review the greeting wording in `business.yaml`.
5. Run the calls in [`TEST_CALLS.md`](TEST_CALLS.md).

### Phase 2: production Square

1. Say go.
2. Replace `SQUARE_ACCESS_TOKEN` with the production token and set
   `SQUARE_ENV=production`.
3. Make one real test booking by phone, confirm whether Square texts the
   customer, then cancel it.

Keeping direct booking after the Square Plus trial ends costs $49 a month.
Without it the receptionist drops to request mode on its own.

### Phase 3: only when Nick doesn't pick up

Google Voice cannot ring your cell first and then fall through to another
number by itself. Options to decide between when we get there:

- A Twilio number (about $1.15 a month) as the only Google Voice forwarding
  target. It rings your cell for 15 seconds with "press 1 to accept", then
  hands the call to the AI.
- If your paid Google Voice plan includes auto attendants or ring groups,
  use those to forward unanswered calls to the AI number.

Nothing in Google Voice gets changed without you doing it yourself.

## Tests

```bash
cd receptionist
```

```bash
deno task test
```

34 tests cover the service area and trip charge, same-day refusal, business
hours, the buffer, double-booking prevention including two simultaneous
calls, request mode, the confirmation requirement, signature checks and the
summary email. They run against in-memory stand-ins for Square and Supabase.
They do not prove that the real Square account behaves the same way. That is
what the test calls are for.

## Deploying code changes

The live function is a ten-line entry point that imports this folder's code
from GitHub at one exact commit, so what runs is exactly what is in git. To
ship a code change: commit, push, then redeploy the entry point with the new
commit ID (ask Claude Code to "redeploy the receptionist"). Config changes
in `business.yaml` do not need a redeploy.

## Folder map

| Path | What it is |
|---|---|
| `business.yaml` | The one file to edit |
| `TEST_CALLS.md` | Test call script and results log |
| `supabase/functions/receptionist/` | The backend |
| `supabase/migrations/` | Database tables |
| `scripts/sync.ts` | Publishes `business.yaml` to Supabase and Retell |
| `tests/` | Automated tests |
