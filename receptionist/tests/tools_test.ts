import { assert, assertEquals } from "jsr:@std/assert@1";
import { clearCaches, handle } from "../supabase/functions/receptionist/lib/app.ts";
import { hmacHex } from "../supabase/functions/receptionist/lib/retell.ts";
import { localToUtc } from "../supabase/functions/receptionist/lib/time.ts";
import { fakeFetch, FakeDb, type FakeSquareState, loadTestConfig, newSquareState } from "./fakes.ts";

const cfg = await loadTestConfig();
const TZ = "America/New_York";
const NOW = localToUtc("2026-11-24", 15 * 60, TZ); // Tuesday 3:00 PM Eastern
const RETELL_KEY = "key_test";
const at = (date: string, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return localToUtc(date, h * 60 + m, TZ).toISOString();
};

function setup(mutate?: (s: FakeSquareState) => void) {
  clearCaches();
  const state = newSquareState();
  state.availability = [
    { start_at: at("2026-11-24", "17:00"), duration_minutes: 90 }, // same day
    { start_at: at("2026-11-25", "09:00"), duration_minutes: 90 },
    { start_at: at("2026-11-25", "11:00"), duration_minutes: 90 }, // too close to the noon booking
    { start_at: at("2026-11-25", "15:00"), duration_minutes: 90 },
    { start_at: at("2026-11-26", "10:00"), duration_minutes: 90 },
  ];
  state.bookings = [{
    id: "EXISTING",
    status: "ACCEPTED",
    start_at: at("2026-11-25", "12:45"),
    appointment_segments: [{ duration_minutes: 60 }],
  }];
  mutate?.(state);
  const db = new FakeDb();
  db.tables.receptionist_config.push({ id: 1, config: cfg });
  const env: Record<string, string> = {
    RETELL_API_KEY: RETELL_KEY,
    SQUARE_ACCESS_TOKEN: "sandbox-token",
    SQUARE_ENV: "sandbox",
    RESEND_API_KEY: "re_test",
  };
  const deps = { env: (k: string) => env[k], db, fetchImpl: fakeFetch(state), now: () => NOW };

  async function post(path: string, body: unknown, opts: { sign?: boolean } = {}) {
    const raw = JSON.stringify(body);
    const ts = NOW.getTime();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (opts.sign !== false) headers["X-Retell-Signature"] = `v=${ts},d=${await hmacHex(RETELL_KEY, raw + ts)}`;
    return handle(new Request(`https://x.supabase.co/functions/v1/receptionist/${path}`, { method: "POST", headers, body: raw }), deps);
  }
  // deno-lint-ignore no-explicit-any
  async function tool(name: string, args: Record<string, unknown> = {}, callId = "call_1"): Promise<any> {
    const res = await post("tool", { name, args, call: { call_id: callId, from_number: "+19045550100" } });
    assertEquals(res.status, 200);
    return await res.json();
  }
  const squareWrites = () => state.calls.filter((c) => c.method === "POST" && (c.path === "/v2/bookings" || c.path === "/v2/customers"));
  return { state, db, deps, post, tool, squareWrites, env };
}

const goodBooking = {
  service_key: "maintenance_electric",
  start_at: at("2026-11-25", "09:00"),
  caller_confirmed: true,
  customer_name: "Dana Ruiz",
  callback_number: "904-555-0100",
  address_line: "12 Palm Way",
  city: "Ponte Vedra",
  zip: "32081",
  cart: "2021 Club Car Onward, electric",
  notes: "Gate code 4411",
};

Deno.test("requests without a valid Retell signature are refused", async () => {
  const t = setup();
  const res = await t.post("tool", { name: "get_services", args: {}, call: { call_id: "x" } }, { sign: false });
  assertEquals(res.status, 401);
  assertEquals(t.state.calls.length, 0);
});

Deno.test("get_services quotes Square's prices and hides services outside the allowlist", async () => {
  const t = setup((s) => s.catalog.push({
    id: "item-LIFT",
    item_data: { name: "Lift kit install", variations: [{ id: "V_LIFT", version: 1, item_variation_data: { name: "Regular", price_money: { amount: 80000 }, service_duration: 3600000, available_for_booking: true } }] },
  }));
  const r = await t.tool("get_services");
  // deno-lint-ignore no-explicit-any
  const keys = r.services.map((s: any) => s.service_key);
  assert(keys.includes("maintenance_electric") && keys.includes("lithium_check"));
  assert(!JSON.stringify(r).includes("Lift kit"));
  // deno-lint-ignore no-explicit-any
  assertEquals(r.services.find((s: any) => s.service_key === "maintenance_gas").price, "219 dollars");
});

Deno.test("find_open_slots never offers same-day or buffer-breaking times", async () => {
  const t = setup();
  const r = await t.tool("find_open_slots", { service_key: "maintenance_electric" });
  // deno-lint-ignore no-explicit-any
  assertEquals(r.slots.map((s: any) => s.say), [
    "Wednesday, November 25 at 9:00 AM",
    "Wednesday, November 25 at 3:00 PM",
    "Thursday, November 26 at 10:00 AM",
  ]);
});

Deno.test("find_open_slots: a request for today gets tomorrow's times and a same-day note", async () => {
  const t = setup();
  const r = await t.tool("find_open_slots", { service_key: "maintenance_electric", preferred_date: "2026-11-24" });
  assert(r.note.includes("too soon"));
  assert(r.slots.length > 0);
  // deno-lint-ignore no-explicit-any
  assert(r.slots.every((s: any) => !s.say.includes("November 24")));
});

Deno.test("create_booking refuses until the caller has confirmed", async () => {
  const t = setup();
  const r = await t.tool("create_booking", { ...goodBooking, caller_confirmed: false });
  assertEquals([r.ok, r.reason], [false, "not_confirmed"]);
  assertEquals(t.squareWrites().length, 0);
  assertEquals(t.db.tables.booking_attempts[0].status, "rejected");
});

Deno.test("create_booking books a valid slot with address, notes and a new customer", async () => {
  const t = setup();
  const r = await t.tool("create_booking", goodBooking);
  assertEquals(r.ok, true);
  assertEquals(r.booked.when, "Wednesday, November 25 at 9:00 AM");
  const b = t.state.bookings.find((x) => x.id === r.booking_id);
  assertEquals(b.location_type, "CUSTOMER_LOCATION");
  assertEquals(b.address.postal_code, "32081");
  assert(b.seller_note.includes("12 Palm Way") && b.seller_note.includes("Gate code 4411") && b.seller_note.includes("Club Car"));
  assertEquals(b.appointment_segments[0], {
    service_variation_id: "V_MAINT_E", service_variation_version: 100, team_member_id: "TM1", duration_minutes: 90,
  });
  assertEquals(t.state.customers.length, 1);
  assertEquals(t.state.customers[0].phone_number, "+19045550100");
  assertEquals(t.state.customers[0].given_name, "Dana");
  const attempt = t.db.tables.booking_attempts.at(-1)!;
  assertEquals([attempt.status, attempt.square_booking_id, attempt.trip_fee_cents], ["booked", r.booking_id, 0]);
});

Deno.test("create_booking reuses an existing Square customer found by phone", async () => {
  const t = setup((s) => s.customers.push({ id: "CUST_OLD", phone_number: "+19045550100" }));
  const r = await t.tool("create_booking", goodBooking);
  assertEquals(r.ok, true);
  assertEquals(t.state.customers.length, 1);
  assertEquals(t.state.bookings.at(-1).customer_id, "CUST_OLD");
});

Deno.test("create_booking records the trip charge for a St. Augustine address", async () => {
  const t = setup();
  const r = await t.tool("create_booking", { ...goodBooking, city: "St. Augustine", zip: "32084" });
  assertEquals(r.booked.trip_charge_dollars, 50);
  assert(t.state.bookings.at(-1).seller_note.includes("Trip charge: $50"));
  assertEquals(t.db.tables.booking_attempts.at(-1)!.trip_fee_cents, 5000);
});

Deno.test("create_booking refuses same-day, out-of-hours, out-of-area and unknown services", async () => {
  const t = setup();
  const reason = async (patch: Record<string, unknown>) => (await t.tool("create_booking", { ...goodBooking, ...patch })).reason;
  assertEquals(await reason({ start_at: at("2026-11-24", "17:00") }), "same_day");
  assertEquals(await reason({ start_at: at("2026-11-25", "07:00") }), "slot_unavailable");
  assertEquals(await reason({ zip: "32266" }), "out_of_area");
  assertEquals(await reason({ service_key: "lift_kit" }), "unknown_service");
  assertEquals(await reason({ callback_number: "555", }), undefined); // falls back to caller ID, so it books
  assertEquals(t.squareWrites().filter((c) => c.path === "/v2/bookings").length, 1);
});

Deno.test("create_booking refuses a slot inside the 30 minute buffer even if Square lists it", async () => {
  const t = setup();
  const r = await t.tool("create_booking", { ...goodBooking, start_at: at("2026-11-25", "11:00") });
  assertEquals([r.ok, r.reason], [false, "slot_unavailable"]);
  assert(r.slots.length > 0, "it should hand back real alternatives");
  assertEquals(t.squareWrites().length, 0);
});

Deno.test("no double booking: the same slot cannot be booked twice", async () => {
  const t = setup();
  assertEquals((await t.tool("create_booking", goodBooking, "call_A")).ok, true);
  const second = await t.tool("create_booking", { ...goodBooking, customer_name: "Sam Lee", callback_number: "9045550111" }, "call_B");
  assertEquals(second.ok, false);
  assertEquals(t.state.bookings.filter((b) => b.id !== "EXISTING").length, 1);
});

Deno.test("no double booking: two calls racing for one slot, only one wins", async () => {
  const t = setup();
  const [a, b] = await Promise.all([
    t.tool("create_booking", goodBooking, "call_A"),
    t.tool("create_booking", { ...goodBooking, customer_name: "Sam Lee", callback_number: "9045550111" }, "call_B"),
  ]);
  assertEquals([a.ok, b.ok].filter(Boolean).length, 1);
  assertEquals(t.state.bookings.filter((x) => x.id !== "EXISTING").length, 1);
});

Deno.test("request mode: without seller-level writes nothing is booked", async () => {
  const t = setup((s) => s.sellerWrites = false);
  assertEquals((await t.tool("find_open_slots", { service_key: "maintenance_electric" })).mode, "request");
  assertEquals((await t.tool("create_booking", goodBooking)).mode, "request");
  assertEquals(t.squareWrites().length, 0);
});

Deno.test("booking.enabled false turns the receptionist into message-only", async () => {
  const t = setup();
  // deno-lint-ignore no-explicit-any
  (t.db.tables.receptionist_config[0].config as any) = { ...cfg, booking: { ...cfg.booking, enabled: false } };
  assertEquals((await t.tool("find_open_slots", { service_key: "maintenance_electric" })).mode, "message_only");
  assertEquals((await t.tool("create_booking", goodBooking)).mode, "message_only");
  assertEquals(t.squareWrites().length, 0);
});

Deno.test("a Square failure is reported as a failure, never as a booking", async () => {
  const t = setup((s) => s.failCreateBooking = true);
  const r = await t.tool("create_booking", goodBooking);
  assertEquals([r.ok, r.reason], [false, "booking_error"]);
  assert(r.instructions.includes("Do not say it is booked"));
  assertEquals(t.db.tables.booking_attempts.at(-1)!.status, "failed");
});

Deno.test("take_message stores same-day and emergency flags", async () => {
  const t = setup();
  await t.tool("take_message", { category: "same_day_request", message: "Wants a detail today in Nocatee", caller_name: "Lee" });
  await t.tool("take_message", { category: "emergency", message: "Battery was smoking, told to call 911" });
  const [a, b] = t.db.tables.messages;
  assertEquals([a.same_day_request, a.urgent, a.callback_number], [true, false, "+19045550100"]);
  assertEquals(b.urgent, true);
  assertEquals((await t.tool("take_message", { category: "other", message: "" })).ok, false);
});

Deno.test("webhook: one summary email per call with booking, message and transcript", async () => {
  const t = setup();
  await t.tool("create_booking", goodBooking);
  await t.tool("take_message", { category: "sales", message: "Also asked about buying a 6-seater", caller_name: "Dana Ruiz" });
  await t.tool("end_call_summary", { caller_name: "Dana Ruiz", reason_for_call: "Maintenance on an electric cart", outcome: "booked" });
  const call = {
    call_id: "call_1", from_number: "+19045550100", to_number: "+19045550199", direction: "inbound",
    start_timestamp: NOW.getTime(), end_timestamp: NOW.getTime() + 185000, disconnection_reason: "user_hangup",
    transcript: "Agent: Thanks for calling Eluxen Carts.\nUser: Hi, I need maintenance.",
    call_analysis: { call_summary: "Booked maintenance." },
  };
  assertEquals((await t.post("webhook", { event: "call_ended", call })).status, 204);
  assertEquals(t.state.emails.length, 0);
  assertEquals((await t.post("webhook", { event: "call_analyzed", call })).status, 204);
  assertEquals((await t.post("webhook", { event: "call_analyzed", call })).status, 204); // Retell retry
  assertEquals(t.state.emails.length, 1);
  // deno-lint-ignore no-explicit-any
  const email = t.state.emails[0] as any;
  assertEquals(email.to, ["hello@eluxencarts.com"]);
  assertEquals(email.subject, "Booked: Dana Ruiz, (904) 555-0100");
  for (const expected of ["Maintenance Electric cart", "Wednesday, November 25 at 9:00 AM", "12 Palm Way", "Square booking ID: BK2", "buying a 6-seater", "Hi, I need maintenance.", "185 seconds"]) {
    assert(email.text.includes(expected), `email should include "${expected}"`);
  }
  assert(!email.text.includes("—"));
});

Deno.test("webhook: a caller who hangs up mid-booking still produces a summary, nothing booked", async () => {
  const t = setup();
  await t.tool("find_open_slots", { service_key: "maintenance_electric" });
  const call = { call_id: "call_1", from_number: "+19045550100", start_timestamp: NOW.getTime(), end_timestamp: NOW.getTime() + 40000, disconnection_reason: "user_hangup", transcript: "User: Actually never mind." };
  await t.post("webhook", { event: "call_analyzed", call });
  // deno-lint-ignore no-explicit-any
  const email = t.state.emails[0] as any;
  assert(email.text.includes("Nothing was booked.") && email.text.includes("No message was left."));
  assertEquals(t.squareWrites().length, 0);
});

Deno.test("webhook: a summary skipped for a missing email key is sent on the next delivery", async () => {
  const t = setup();
  delete t.env.RESEND_API_KEY;
  const call = { call_id: "call_9", from_number: "+19045550100", transcript: "x" };
  assertEquals((await t.post("webhook", { event: "call_analyzed", call })).status, 204);
  assertEquals(t.db.tables.calls[0].email_status, "no_api_key");
  t.env.RESEND_API_KEY = "re_test";
  await t.post("webhook", { event: "call_analyzed", call });
  assertEquals(t.state.emails.length, 1);
});

Deno.test("selftest: runs a tool with a live token, refuses without one, and is off in production", async () => {
  const { db, deps, env } = setup();
  const token = "0b0e4b52-58a1-4d0c-9f0a-2d3c1a9e7f11";
  db.tables.selftest_tokens.push({ token, expires_at: new Date(NOW.getTime() + 3600_000).toISOString() });
  const call = (headers: Record<string, string>, body: unknown) =>
    handle(
      new Request("https://x.supabase.co/functions/v1/receptionist/selftest", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }),
      deps,
    );

  assertEquals((await call({}, { name: "get_services" })).status, 401);
  assertEquals((await call({ "x-selftest-token": token.replace("0b", "1c") }, { name: "get_services" })).status, 401);

  const ok = await call({ "x-selftest-token": token }, { name: "get_services" });
  assertEquals(ok.status, 200);
  assert((await ok.json()).services.length > 0);
  assert(String(db.tables.tool_calls[0].call_id).startsWith("selftest-"));

  const diag = await (await call({ "x-selftest-token": token }, { name: "diagnostics" })).json();
  assertEquals(diag.seller_writes, true);
  assertEquals(diag.services.in_square.length, 4);

  db.tables.selftest_tokens[0].expires_at = new Date(NOW.getTime() - 1000).toISOString();
  assertEquals((await call({ "x-selftest-token": token }, { name: "get_services" })).status, 401);

  db.tables.selftest_tokens[0].expires_at = new Date(NOW.getTime() + 3600_000).toISOString();
  env.SQUARE_ENV = "production";
  assertEquals((await call({ "x-selftest-token": token }, { name: "get_services" })).status, 404);
});

Deno.test("retell-sync: creates the LLM and agent once, updates them after, and needs a token", async () => {
  const { db, deps, state } = setup();
  const token = "0b0e4b52-58a1-4d0c-9f0a-2d3c1a9e7f11";
  const call = (headers: Record<string, string>, body: unknown) =>
    handle(
      new Request("https://x.supabase.co/functions/v1/receptionist/admin/retell-sync", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }),
      deps,
    );
  const payload = { llm: { general_prompt: "hi" }, agent: { voice_id: "retell-Cimo" } };

  assertEquals((await call({}, payload)).status, 401);
  assertEquals(state.retell.length, 0);

  db.tables.selftest_tokens.push({ token, expires_at: new Date(NOW.getTime() + 3600_000).toISOString() });
  const first = await (await call({ "x-selftest-token": token }, payload)).json();
  assertEquals([first.ok, first.llm, first.agent, first.llm_id, first.agent_id], [true, "created", "created", "llm_1", "agent_1"]);
  assertEquals(state.retell[1].body.response_engine, { type: "retell-llm", llm_id: "llm_1" });
  assertEquals(state.retell[0].auth, `Bearer ${RETELL_KEY}`);

  const second = await (await call({ "x-selftest-token": token }, payload)).json();
  assertEquals([second.llm, second.agent], ["updated", "updated"]);
  assertEquals(state.retell.slice(2).map((r) => `${r.method} ${r.path}`), [
    "PATCH /update-retell-llm/llm_1",
    "PATCH /update-agent/agent_1",
  ]);
  assert(!JSON.stringify([first, second]).includes(RETELL_KEY));

  const voices = await (await call({ "x-selftest-token": token }, { op: "voices" })).json();
  assertEquals(voices.voices[0].voice_id, "retell-Cimo");
});
