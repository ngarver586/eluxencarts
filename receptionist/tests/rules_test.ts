import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  checkArea,
  filterSlots,
  matchServices,
  pickOffers,
  slotProblem,
  toE164,
} from "../supabase/functions/receptionist/lib/rules.ts";
import { localParts, localToUtc, spokenLabel } from "../supabase/functions/receptionist/lib/time.ts";
import { hmacHex, verifyRetellSignature } from "../supabase/functions/receptionist/lib/retell.ts";
import { loadTestConfig } from "./fakes.ts";

const cfg = await loadTestConfig();
const TZ = "America/New_York";
// Tuesday, November 24, 2026 at 3:00 PM Eastern
const NOW = localToUtc("2026-11-24", 15 * 60, TZ);
const at = (date: string, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return localToUtc(date, h * 60 + m, TZ);
};

Deno.test("time zone conversion handles standard and daylight time", () => {
  assertEquals(at("2026-11-25", "10:00").toISOString(), "2026-11-25T15:00:00.000Z");
  assertEquals(at("2026-07-01", "10:00").toISOString(), "2026-07-01T14:00:00.000Z");
  assertEquals(localParts(new Date("2026-11-25T02:30:00Z"), TZ).date, "2026-11-24");
  assertEquals(spokenLabel(at("2026-11-25", "10:00"), TZ), "Wednesday, November 25 at 10:00 AM");
});

Deno.test("service area: free inside 10 miles of 32081", () => {
  for (const zip of ["32081", "32082", "32259", "32095", "32258"]) {
    const r = checkArea(cfg, { zip });
    assertEquals([zip, r.status, r.trip_fee_dollars], [zip, "in_area", 0]);
  }
});

Deno.test("service area: 50 dollar trip charge beyond 10 miles", () => {
  for (const zip of ["32250", "32084", "32092", "32256", "32207"]) {
    const r = checkArea(cfg, { zip });
    assertEquals([zip, r.status, r.trip_fee_dollars], [zip, "in_area", 50]);
  }
});

Deno.test("service area: other towns and unknown ZIPs are message only", () => {
  assertEquals(checkArea(cfg, { zip: "32266" }).status, "out_of_area"); // Neptune Beach
  assertEquals(checkArea(cfg, { zip: "32073" }).status, "out_of_area"); // Orange Park
  assertEquals(checkArea(cfg, { zip: "33101" }).status, "out_of_area"); // Miami
  assertEquals(checkArea(cfg, { city: "Orlando" }).status, "out_of_area");
});

Deno.test("service area: city without ZIP", () => {
  assertEquals(checkArea(cfg, { city: "Nocatee" }), {
    status: "in_area", zip: "32081", city: "Ponte Vedra", miles: 0, trip_fee_dollars: 0,
  });
  assertEquals(checkArea(cfg, { city: "Jacksonville" }).status, "need_zip"); // some ZIPs free, most not
  assertEquals(checkArea(cfg, { city: "Jacksonville Beach" }).trip_fee_dollars, 50);
  assertEquals(checkArea(cfg, {}).status, "need_zip");
});

Deno.test("service area: per-ZIP override wins", () => {
  const c = structuredClone(cfg);
  c.service_area.zip_overrides = { "32266": "fee", "32082": "no" };
  assertEquals(checkArea(c, { zip: "32266" }).trip_fee_dollars, 50);
  assertEquals(checkArea(c, { zip: "32082" }).status, "out_of_area");
});

Deno.test("same-day is never bookable, even late at night", () => {
  assertEquals(slotProblem(cfg, NOW, at("2026-11-24", "17:00").getTime(), 60, []), "too_soon");
  assertEquals(slotProblem(cfg, NOW, at("2026-11-25", "09:00").getTime(), 60, []), null);
  const lateNight = at("2026-11-24", "23:55");
  assertEquals(slotProblem(cfg, lateNight, at("2026-11-24", "23:59").getTime(), 1, []), "too_soon");
  assertEquals(slotProblem(cfg, lateNight, at("2026-11-25", "09:00").getTime(), 60, []), null);
});

Deno.test("nothing outside 9 AM to 7 PM Eastern", () => {
  assertEquals(slotProblem(cfg, NOW, at("2026-11-25", "08:30").getTime(), 60, []), "outside_hours");
  assertEquals(slotProblem(cfg, NOW, at("2026-11-25", "18:30").getTime(), 60, []), "outside_hours");
  assertEquals(slotProblem(cfg, NOW, at("2026-11-25", "18:00").getTime(), 60, []), null);
  assertEquals(slotProblem(cfg, NOW, at("2026-11-25", "22:30").getTime(), 120, []), "outside_hours");
});

Deno.test("30 minute buffer before and after every existing appointment", () => {
  const busy = [{ start: at("2026-11-25", "12:00").getTime(), end: at("2026-11-25", "13:00").getTime() }];
  const p = (hhmm: string, mins: number) => slotProblem(cfg, NOW, at("2026-11-25", hhmm).getTime(), mins, busy);
  assertEquals(p("10:30", 60), null); // ends 11:30, exactly 30 minutes clear
  assertEquals(p("10:45", 60), "buffer_conflict"); // ends 11:45, only 15 clear
  assertEquals(p("12:30", 30), "buffer_conflict"); // overlaps
  assertEquals(p("13:15", 60), "buffer_conflict"); // starts 15 after
  assertEquals(p("13:30", 60), null); // starts exactly 30 after
});

Deno.test("filterSlots and pickOffers only return compliant times", () => {
  const busy = [{ start: at("2026-11-25", "12:00").getTime(), end: at("2026-11-25", "13:00").getTime() }];
  const c = (d: string, t: string) => ({ start_at: at(d, t).toISOString(), duration_minutes: 60 });
  const slots = filterSlots(cfg, NOW, [
    c("2026-11-24", "17:00"), // same day
    c("2026-11-25", "09:00"),
    c("2026-11-25", "11:30"), // inside buffer
    c("2026-11-25", "14:00"),
    c("2026-11-25", "18:30"), // runs past 7 PM
    c("2026-11-26", "10:00"),
    c("2026-11-26", "10:00"), // duplicate
  ], busy);
  assertEquals(slots.map((s) => spokenLabel(new Date(s.start_at), TZ)), [
    "Wednesday, November 25 at 9:00 AM",
    "Wednesday, November 25 at 2:00 PM",
    "Thursday, November 26 at 10:00 AM",
  ]);
  assertEquals(pickOffers(cfg, slots).length, 3);
  assertEquals(pickOffers(cfg, slots, { timeOfDay: "afternoon" }).map((o) => o.label), [
    "Wednesday, November 25 at 2:00 PM",
  ]);
  assertEquals(pickOffers(cfg, slots, { preferredDate: "2026-11-26" })[0].label, "Thursday, November 26 at 10:00 AM");
  assertEquals(pickOffers(cfg, []), []);
});

Deno.test("Square is the source of truth for prices, mismatches are flagged", () => {
  const v = (id: string, item: string, variation: string, cents: number | null, mins: number | null, bookable = true) => ({
    variation_id: id, version: 1, item_name: item, variation_name: variation, price_cents: cents,
    duration_minutes: mins, available_for_booking: bookable, team_member_ids: [],
  });
  const { services, mismatches } = matchServices(cfg, [
    v("A", "Maintenance", "Electric cart", 19900, 90), // price changed in Square
    v("B", "Maintenance", "Gas cart", 21900, 90),
    v("C", "Diagnostic or lithium battery check", "Regular", 9900, 60),
    v("D", "Lift kit install", "Regular", 80000, 240), // not on the allowlist
    v("E", "LED seat or floor lights", "Regular", null, 180), // variable price
    v("F", "Cart transport", "Local move", 15000, 60, false), // not bookable in Square
    v("G", "Holiday lights", "Parade Ready", 12900, 60),
    v("H", "Holiday lights", "Parade Ready + Power", 22900, 90),
    v("I", "Power add-on", "12V hookup + 4 USB ports", 10000, 45),
    v("J", "USB charging ports", "Regular", 7900, 30),
  ]);
  const byKey = Object.fromEntries(services.map((s) => [s.key, s]));
  assertEquals(byKey.maintenance_electric.price_text, "199 dollars");
  assertEquals(byKey.diagnostic.variation_id, "C");
  assertEquals(byKey.lithium_check.variation_id, "C");
  assertEquals(byKey.led_seat_floor.price_text, "from 399 dollars");
  assertEquals(byKey.holiday_lights.variation_id, "G");
  assertEquals(byKey.holiday_lights_power.variation_id, "H");
  assertEquals(byKey.power_addon.variation_id, "I");
  assertEquals(byKey.usb_ports.variation_id, "J");
  assert(!byKey.cart_transport, "a service not bookable in Square must not be offered");
  assert(!services.some((s) => s.variation_id === "D"), "services outside the allowlist are never bookable");
  assert(mismatches.some((m) => m.includes("Price mismatch") && m.includes("$199")));
  assert(mismatches.some((m) => m.includes("Lift kit install")));
  assert(mismatches.some((m) => m.includes("show_detail_4") && m.includes("not found in Square")));
});

Deno.test("phone numbers normalize to E.164", () => {
  assertEquals(toE164("(904) 395-5452"), "+19043955452");
  assertEquals(toE164("+1 904 395 5452"), "+19043955452");
  assertEquals(toE164("395-5452"), null);
  assertEquals(toE164(undefined), null);
});

Deno.test("Retell signature: accepts genuine, rejects forged, stale and malformed", async () => {
  const key = "key_test";
  const body = '{"name":"get_services","args":{}}';
  const now = 1_800_000_000_000;
  const sig = `v=${now},d=${await hmacHex(key, body + now)}`;
  assert(await verifyRetellSignature(body, key, sig, now + 1000));
  assert(!(await verifyRetellSignature(body + " ", key, sig, now)));
  assert(!(await verifyRetellSignature(body, "other_key", sig, now)));
  assert(!(await verifyRetellSignature(body, key, sig, now + 6 * 60 * 1000)));
  assert(!(await verifyRetellSignature(body, key, null, now)));
  assert(!(await verifyRetellSignature(body, key, "garbage", now)));
});
