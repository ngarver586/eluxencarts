// Pure business rules: service area, slot filtering, service matching.
// No network or database access here, so every rule is unit tested.

import { ZIPS } from "./zipdata.ts";
import { addDays, localParts, parseHHMM, spokenLabel } from "./time.ts";

export interface ServiceRule {
  key: string;
  say: string;
  match: string[];
  not?: string[];
  expect_price?: number;
  from_price?: boolean;
  note?: string;
}

export interface Config {
  business: { name: string; owner: string; phone: string; website: string; timezone: string };
  summary_email: { to: string; from: string };
  greeting: string;
  hours: { open: string; close: string };
  booking: {
    enabled: boolean;
    earliest_days_ahead: number;
    buffer_minutes: number;
    max_days_ahead: number;
    offer_count: number;
  };
  service_area: {
    home_zip: string;
    free_radius_miles: number;
    trip_fee_dollars: number;
    cities: string[];
    zip_overrides?: Record<string, "free" | "fee" | "no">;
  };
  services: ServiceRule[];
}

// ---------- service area ----------

export function normalizeCity(s: string): string {
  return String(s ?? "").toLowerCase().replace(/\./g, "").replace(/\bst\b/g, "saint")
    .replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
}

export function milesBetween(a: [number, number], b: [number, number]): number {
  const R = 3958.8;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface AreaResult {
  status: "in_area" | "out_of_area" | "need_zip";
  zip?: string;
  city?: string;
  miles?: number;
  trip_fee_dollars: number;
}

function classifyZip(cfg: Config, zip: string): AreaResult {
  const sa = cfg.service_area;
  const row = ZIPS[zip];
  const home = ZIPS[sa.home_zip];
  const override = sa.zip_overrides?.[zip];
  const miles = row && home
    ? Math.round(milesBetween([home[1], home[2]], [row[1], row[2]]) * 10) / 10
    : undefined;
  const city = row?.[0];
  if (override === "no") return { status: "out_of_area", zip, city, miles, trip_fee_dollars: 0 };
  if (override === "free") return { status: "in_area", zip, city, miles, trip_fee_dollars: 0 };
  if (override === "fee") {
    return { status: "in_area", zip, city, miles, trip_fee_dollars: sa.trip_fee_dollars };
  }
  if (!row || miles === undefined) return { status: "out_of_area", zip, trip_fee_dollars: 0 };
  const allowed = new Set(sa.cities.map(normalizeCity));
  // Nocatee is a community, not a postal city. It is the home ZIP.
  const inList = allowed.has(normalizeCity(row[0])) || zip === sa.home_zip;
  if (!inList) return { status: "out_of_area", zip, city, miles, trip_fee_dollars: 0 };
  const fee = miles > sa.free_radius_miles ? sa.trip_fee_dollars : 0;
  return { status: "in_area", zip, city, miles, trip_fee_dollars: fee };
}

export function checkArea(cfg: Config, input: { zip?: string; city?: string }): AreaResult {
  const zip = String(input.zip ?? "").replace(/\D/g, "").slice(0, 5);
  if (zip.length === 5) return classifyZip(cfg, zip);

  const city = normalizeCity(input.city ?? "");
  if (!city) return { status: "need_zip", trip_fee_dollars: 0 };
  if (city === "nocatee") return classifyZip(cfg, cfg.service_area.home_zip);
  const allowed = new Set(cfg.service_area.cities.map(normalizeCity));
  if (!allowed.has(city)) return { status: "out_of_area", city: input.city, trip_fee_dollars: 0 };
  // Known city without a ZIP: answer only if every ZIP in that city gives the same result.
  const results = Object.keys(ZIPS).filter((z) => normalizeCity(ZIPS[z][0]) === city)
    .map((z) => classifyZip(cfg, z));
  const kinds = new Set(results.map((r) => `${r.status}:${r.trip_fee_dollars}`));
  if (results.length > 0 && kinds.size === 1) {
    return { status: results[0].status, city: input.city, trip_fee_dollars: results[0].trip_fee_dollars };
  }
  return { status: "need_zip", city: input.city, trip_fee_dollars: 0 };
}

// ---------- slots ----------

export interface Interval {
  start: number; // epoch ms
  end: number;
}

export interface Candidate {
  start_at: string; // ISO UTC
  duration_minutes: number;
}

export type SlotRejection = "too_soon" | "too_far" | "outside_hours" | "buffer_conflict";

/** Returns null when the slot is allowed, otherwise the rule it breaks. */
export function slotProblem(
  cfg: Config,
  now: Date,
  startMs: number,
  durationMinutes: number,
  busy: Interval[],
): SlotRejection | null {
  const tz = cfg.business.timezone;
  const endMs = startMs + durationMinutes * 60_000;
  const today = localParts(now, tz).date;
  const start = localParts(new Date(startMs), tz);
  const end = localParts(new Date(endMs), tz);

  if (start.date < addDays(today, cfg.booking.earliest_days_ahead)) return "too_soon";
  if (start.date > addDays(today, cfg.booking.max_days_ahead)) return "too_far";

  const open = parseHHMM(cfg.hours.open);
  const close = parseHHMM(cfg.hours.close);
  const endMinutes = end.date === start.date ? end.minutes : 24 * 60 + end.minutes;
  if (start.minutes < open || endMinutes > close) return "outside_hours";

  return bufferConflict(cfg, startMs, endMs, busy) ? "buffer_conflict" : null;
}

/** True when [startMs, endMs] sits closer than the buffer to any busy interval. */
export function bufferConflict(cfg: Config, startMs: number, endMs: number, busy: Interval[]): boolean {
  const buf = cfg.booking.buffer_minutes * 60_000;
  return busy.some((b) => startMs < b.end + buf && endMs > b.start - buf);
}

export function filterSlots(
  cfg: Config,
  now: Date,
  candidates: Candidate[],
  busy: Interval[],
): Candidate[] {
  const seen = new Set<string>();
  return candidates
    .filter((c) => {
      const ms = Date.parse(c.start_at);
      if (Number.isNaN(ms) || seen.has(c.start_at)) return false;
      seen.add(c.start_at);
      return slotProblem(cfg, now, ms, c.duration_minutes, busy) === null;
    })
    .sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at));
}

export type TimeOfDay = "morning" | "afternoon" | "evening" | "any";

function inTimeOfDay(minutes: number, tod: TimeOfDay): boolean {
  if (tod === "morning") return minutes < 12 * 60;
  if (tod === "afternoon") return minutes >= 12 * 60 && minutes < 16 * 60;
  if (tod === "evening") return minutes >= 16 * 60;
  return true;
}

export interface Offer {
  start_at: string;
  label: string;
  duration_minutes: number;
}

/**
 * Pick a few slots to read to the caller: the earliest that fits, a later one
 * the same day, then the earliest on following days.
 */
export function pickOffers(
  cfg: Config,
  slots: Candidate[],
  opts: { preferredDate?: string; timeOfDay?: TimeOfDay } = {},
): Offer[] {
  const tz = cfg.business.timezone;
  const count = cfg.booking.offer_count;
  const tod = opts.timeOfDay ?? "any";
  let pool = slots.map((s) => ({ s, lp: localParts(new Date(s.start_at), tz) }));
  if (opts.preferredDate) {
    const onOrAfter = pool.filter((x) => x.lp.date >= opts.preferredDate!);
    if (onOrAfter.length) pool = onOrAfter;
  }
  const matchingTod = pool.filter((x) => inTimeOfDay(x.lp.minutes, tod));
  if (matchingTod.length) pool = matchingTod;

  const byDay = new Map<string, typeof pool>();
  for (const x of pool) {
    if (!byDay.has(x.lp.date)) byDay.set(x.lp.date, []);
    byDay.get(x.lp.date)!.push(x);
  }
  const picked: typeof pool = [];
  const days = [...byDay.keys()].sort();
  if (days.length) {
    const first = byDay.get(days[0])!;
    picked.push(first[0]);
    const later = first.find((x) => x.lp.minutes >= first[0].lp.minutes + 180);
    if (later && picked.length < count) picked.push(later);
    for (const d of days.slice(1)) {
      if (picked.length >= count) break;
      picked.push(byDay.get(d)![0]);
    }
    // Still short (only one day has openings): fill from that day.
    for (const x of first) {
      if (picked.length >= count) break;
      if (!picked.includes(x)) picked.push(x);
    }
  }
  return picked
    .sort((a, b) => Date.parse(a.s.start_at) - Date.parse(b.s.start_at))
    .map((x) => ({
      start_at: x.s.start_at,
      label: spokenLabel(new Date(x.s.start_at), tz),
      duration_minutes: x.s.duration_minutes,
    }));
}

// ---------- matching Square services to the allowlist ----------

export interface SquareVariation {
  variation_id: string;
  version: number;
  item_name: string;
  variation_name: string;
  price_cents: number | null; // null = variable or no price in Square
  duration_minutes: number | null;
  available_for_booking: boolean;
  team_member_ids: string[];
}

export interface MatchedService {
  key: string;
  say: string;
  note?: string;
  square_name: string;
  variation_id: string;
  version: number;
  price_cents: number | null;
  price_text: string;
  duration_minutes: number;
  team_member_ids: string[];
}

function fullName(v: SquareVariation): string {
  const vn = v.variation_name && !/^regular$/i.test(v.variation_name) ? ` ${v.variation_name}` : "";
  return `${v.item_name}${vn}`.trim();
}

function ruleMatches(rule: ServiceRule, name: string): boolean {
  const n = name.toLowerCase();
  return rule.match.every((w) => n.includes(String(w).toLowerCase())) &&
    !(rule.not ?? []).some((w) => n.includes(String(w).toLowerCase()));
}

export function priceText(rule: ServiceRule, cents: number | null): string {
  if (cents === null) {
    return rule.expect_price ? `from ${rule.expect_price} dollars` : "price confirmed at the appointment";
  }
  if (cents === 0) return "no charge";
  const dollars = cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
  return `${rule.from_price ? "from " : ""}${dollars} dollars`;
}

export function matchServices(
  cfg: Config,
  variations: SquareVariation[],
): { services: MatchedService[]; mismatches: string[] } {
  const mismatches: string[] = [];
  // One Square service may satisfy more than one rule (for example a single
  // "Diagnostic or lithium battery check"). Use `not` in business.yaml to keep
  // look-alike services apart.
  const byKey = new Map<string, SquareVariation[]>();
  for (const v of variations) {
    const name = fullName(v);
    const hits = cfg.services.filter((r) => ruleMatches(r, name));
    if (!hits.length) {
      mismatches.push(`Square service "${name}" is not in business.yaml, so the AI will not book it.`);
      continue;
    }
    for (const r of hits) {
      if (!byKey.has(r.key)) byKey.set(r.key, []);
      byKey.get(r.key)!.push(v);
    }
  }

  const services: MatchedService[] = [];
  for (const rule of cfg.services) {
    const found = byKey.get(rule.key) ?? [];
    if (!found.length) {
      mismatches.push(`"${rule.say}" (${rule.key}) was not found in Square, so the AI cannot book it.`);
      continue;
    }
    let v = found[0];
    if (found.length > 1) {
      const exact = found.find((f) => f.price_cents === (rule.expect_price ?? -1) * 100);
      v = exact ?? found[0];
      mismatches.push(
        `"${rule.say}" matches ${found.length} Square services (${found.map(fullName).join("; ")}). Using "${fullName(v)}".`,
      );
    }
    if (!v.available_for_booking) {
      mismatches.push(`Square service "${fullName(v)}" is not marked bookable in Square.`);
      continue;
    }
    if (!v.duration_minutes) {
      mismatches.push(`Square service "${fullName(v)}" has no duration in Square.`);
      continue;
    }
    if (
      rule.expect_price !== undefined && v.price_cents !== null &&
      v.price_cents !== rule.expect_price * 100
    ) {
      mismatches.push(
        `Price mismatch for "${fullName(v)}": Square says $${v.price_cents / 100}, business.yaml expects $${rule.expect_price}. The AI quotes the Square price.`,
      );
    }
    services.push({
      key: rule.key,
      say: rule.say,
      note: rule.note,
      square_name: fullName(v),
      variation_id: v.variation_id,
      version: v.version,
      price_cents: v.price_cents,
      price_text: priceText(rule, v.price_cents),
      duration_minutes: v.duration_minutes,
      team_member_ids: v.team_member_ids,
    });
  }
  return { services, mismatches };
}

// ---------- phone numbers ----------

/** Normalize a US phone number to E.164, or null when it is not a usable number. */
export function toE164(raw: string | undefined | null): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}
