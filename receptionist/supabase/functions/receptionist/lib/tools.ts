// The six tools the voice agent can call during a live call.
// Each returns a small JSON object the agent reads, usually with an
// `instructions` line telling it what to say or do next.

import type { Db, Row } from "./db.ts";
import {
  bufferConflict,
  type Candidate,
  checkArea,
  type Config,
  filterSlots,
  type MatchedService,
  matchServices,
  pickOffers,
  slotProblem,
  type TimeOfDay,
  toE164,
} from "./rules.ts";
import { busyIntervals, type Square, SquareError } from "./square.ts";
import { addDays, localParts, localToUtc, spokenLabel } from "./time.ts";

export interface Ctx {
  cfg: Config;
  square: Square | null;
  db: Db;
  now: () => Date;
  callId: string;
  fromNumber?: string;
}

type Args = Record<string, unknown>;
export type ToolResult = Record<string, unknown>;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());

const TAKE_MESSAGE = "Take a message with take_message and say Nick will call back, usually the same day.";

export async function loadServices(
  ctx: Ctx,
): Promise<{ services: MatchedService[]; mismatches: string[] }> {
  if (!ctx.square) throw new Error("Square is not configured");
  return matchServices(ctx.cfg, await ctx.square.listServiceVariations());
}

/** Why direct booking is unavailable right now, or null when it is available. */
async function bookingBlock(ctx: Ctx): Promise<ToolResult | null> {
  if (!ctx.cfg.booking.enabled) {
    return { ok: false, mode: "message_only", instructions: `Booking is turned off. ${TAKE_MESSAGE}` };
  }
  if (!ctx.square) {
    return { ok: false, mode: "message_only", instructions: `The calendar is not connected. ${TAKE_MESSAGE}` };
  }
  if (!(await ctx.square.sellerWritesSupported())) {
    return {
      ok: false,
      mode: "request",
      instructions:
        'You cannot book directly right now. Ask for two or three days and times that work, then call take_message with category "booking_request". Say Nick will confirm the time, usually the same day.',
    };
  }
  return null;
}

/** Open, rule-compliant slots for a service across the whole booking window. */
async function computeSlots(
  ctx: Ctx,
  service: MatchedService,
): Promise<(Candidate & { version?: number; team_member_id?: string })[]> {
  const { cfg } = ctx;
  const tz = cfg.business.timezone;
  const now = ctx.now();
  const today = localParts(now, tz).date;
  const days = Math.min(Math.max(cfg.booking.max_days_ahead, 2), 28);
  const start = localToUtc(addDays(today, cfg.booking.earliest_days_ahead), 0, tz);
  const end = localToUtc(addDays(today, cfg.booking.earliest_days_ahead + days), 0, tz);
  const day = 24 * 3600 * 1000;
  const [avail, bookings] = await Promise.all([
    ctx.square!.searchAvailability(service.variation_id, start, end),
    // One day either side so a late booking the night before still blocks the buffer.
    ctx.square!.listBookings(new Date(start.getTime() - day), new Date(end.getTime() + day)),
  ]);
  const candidates = avail.map((a) => ({
    ...a,
    duration_minutes: a.duration_minutes ?? service.duration_minutes,
  }));
  const valid = filterSlots(cfg, now, candidates, busyIntervals(bookings));
  const byStart = new Map(candidates.map((c) => [c.start_at, c]));
  return valid.map((v) => byStart.get(v.start_at)!);
}

// ---------- get_services ----------

export async function getServices(ctx: Ctx): Promise<ToolResult> {
  if (!ctx.square) {
    return { ok: false, instructions: `The service list is unavailable. Do not quote prices. ${TAKE_MESSAGE}` };
  }
  const { services } = await loadServices(ctx);
  return {
    ok: true,
    services: services.map((s) => ({
      service_key: s.key,
      name: s.say,
      price: s.price_text,
      duration_minutes: s.duration_minutes,
      ...(s.note ? { note: s.note } : {}),
    })),
    instructions:
      "Quote only these prices. Anything not on this list is not bookable: take a message.",
  };
}

// ---------- check_service_area ----------

export function checkServiceArea(ctx: Ctx, args: Args): ToolResult {
  const r = checkArea(ctx.cfg, { zip: str(args.zip), city: str(args.city) });
  if (r.status === "need_zip") {
    return { ok: true, status: "need_zip", instructions: "Ask the caller for the ZIP code, then call this again." };
  }
  if (r.status === "out_of_area") {
    return {
      ok: true,
      status: "out_of_area",
      instructions:
        `That address is outside the regular service area. Do not book. ${TAKE_MESSAGE} Say Nick will let them know if he can cover it.`,
    };
  }
  return {
    ok: true,
    status: "in_area",
    trip_charge_dollars: r.trip_fee_dollars,
    instructions: r.trip_fee_dollars > 0
      ? `In the service area with a ${r.trip_fee_dollars} dollar trip charge. Tell the caller about the trip charge before booking.`
      : "In the service area. No trip charge.",
  };
}

// ---------- find_open_slots ----------

export async function findOpenSlots(ctx: Ctx, args: Args): Promise<ToolResult> {
  const blocked = await bookingBlock(ctx);
  if (blocked) return blocked;
  const { services } = await loadServices(ctx);
  const service = services.find((s) => s.key === str(args.service_key));
  if (!service) {
    return {
      ok: false,
      instructions: `"${str(args.service_key)}" is not a bookable service. Call get_services for the valid service_key values, or take a message.`,
    };
  }
  const tz = ctx.cfg.business.timezone;
  const today = localParts(ctx.now(), tz).date;
  const earliest = addDays(today, ctx.cfg.booking.earliest_days_ahead);
  let preferredDate = /^\d{4}-\d{2}-\d{2}$/.test(str(args.preferred_date)) ? str(args.preferred_date) : undefined;
  let note: string | undefined;
  if (preferredDate && preferredDate < earliest) {
    note = "The caller asked for a day that is too soon. The earliest bookable day is tomorrow. Say so. If they still want today, take a message with same_day_request true.";
    preferredDate = undefined;
  }
  const tod = (["morning", "afternoon", "evening"].includes(str(args.time_of_day))
    ? str(args.time_of_day)
    : "any") as TimeOfDay;

  const slots = await computeSlots(ctx, service);
  const offers = pickOffers(ctx.cfg, slots, { preferredDate, timeOfDay: tod });
  if (!offers.length) {
    return {
      ok: true,
      slots: [],
      instructions: `There are no open times in the next ${ctx.cfg.booking.max_days_ahead} days. ${TAKE_MESSAGE}`,
    };
  }
  return {
    ok: true,
    service: service.say,
    price: service.price_text,
    slots: offers.map((o) => ({ start_at: o.start_at, say: o.label })),
    ...(note ? { note } : {}),
    instructions:
      "Offer only these times, all Eastern time. Pass the chosen start_at to create_booking exactly as written. If none work, call this again with another preferred_date or time_of_day.",
  };
}

// ---------- create_booking ----------

async function logAttempt(ctx: Ctx, row: Row): Promise<void> {
  try {
    await ctx.db.insert("booking_attempts", { call_id: ctx.callId, ...row });
  } catch (e) {
    console.error("booking_attempts insert failed", e);
  }
}

function splitName(full: string): { given_name: string; family_name?: string } {
  const parts = full.split(/\s+/).filter(Boolean);
  return { given_name: parts[0] ?? full, family_name: parts.slice(1).join(" ") || undefined };
}

export async function createBooking(ctx: Ctx, args: Args): Promise<ToolResult> {
  const base: Row = {
    service_key: str(args.service_key),
    customer_name: str(args.customer_name),
    phone: str(args.callback_number) || ctx.fromNumber || null,
    zip: str(args.zip),
    details: { args },
  };
  const reject = async (reason: string, instructions: string, extra: ToolResult = {}) => {
    await logAttempt(ctx, { ...base, status: "rejected", reason });
    return { ok: false, reason, instructions, ...extra };
  };

  const blocked = await bookingBlock(ctx);
  if (blocked) {
    await logAttempt(ctx, { ...base, status: "rejected", reason: String(blocked.mode) });
    return blocked;
  }
  if (args.caller_confirmed !== true) {
    return reject(
      "not_confirmed",
      "Do not book yet. Read back the service, price, any trip charge, date, time, address, name and callback number. Call again with caller_confirmed true only after the caller says yes.",
    );
  }
  const name = str(args.customer_name);
  const phone = toE164(str(args.callback_number)) ?? toE164(ctx.fromNumber);
  const addressLine = str(args.address_line);
  const zip = str(args.zip).replace(/\D/g, "").slice(0, 5);
  if (!name) return reject("missing_name", "Ask for the caller's full name, then try again.");
  if (!phone) return reject("missing_phone", "Ask for a 10 digit callback number, then try again.");
  if (!addressLine || zip.length !== 5) {
    return reject("missing_address", "Ask for the street address and ZIP code, then try again.");
  }

  const area = checkArea(ctx.cfg, { zip });
  if (area.status !== "in_area") {
    return reject("out_of_area", `That address is outside the service area. Do not book. ${TAKE_MESSAGE}`);
  }

  const { services } = await loadServices(ctx);
  const service = services.find((s) => s.key === str(args.service_key));
  if (!service) {
    return reject("unknown_service", "That service is not bookable. Call get_services, or take a message.");
  }

  const tz = ctx.cfg.business.timezone;
  const startMs = Date.parse(str(args.start_at));
  if (Number.isNaN(startMs)) {
    return reject("bad_time", "Use a start_at value returned by find_open_slots.");
  }
  const early = slotProblem(ctx.cfg, ctx.now(), startMs, service.duration_minutes, []);
  if (early === "too_soon") {
    return reject(
      "same_day",
      "That is too soon. The earliest bookable day is tomorrow. Offer times from find_open_slots, or take a message with same_day_request true.",
    );
  }

  // Re-check the live calendar right now. Square does not stop double bookings for this app.
  const slots = await computeSlots(ctx, service);
  const slot = slots.find((s) => Date.parse(s.start_at) === startMs);
  if (!slot) {
    const offers = pickOffers(ctx.cfg, slots, { preferredDate: localParts(new Date(startMs), tz).date });
    return reject(
      "slot_unavailable",
      offers.length
        ? "That time is no longer open. Apologize and offer these times instead."
        : `That time is no longer open and nothing else is available. ${TAKE_MESSAGE}`,
      { slots: offers.map((o) => ({ start_at: o.start_at, say: o.label })) },
    );
  }
  const endMs = startMs + slot.duration_minutes * 60_000;

  // Reserve the slot in our own database so two calls cannot book it at once.
  const attemptId = await ctx.db.rpc("claim_slot", {
    p_call_id: ctx.callId,
    p_start: new Date(startMs).toISOString(),
    p_end: new Date(endMs).toISOString(),
    p_buffer_minutes: ctx.cfg.booking.buffer_minutes,
  }) as string | null;
  if (!attemptId) {
    return reject("slot_just_taken", "Someone just took that time. Apologize, call find_open_slots again and offer new times.");
  }
  const finish = async (patch: Row) => {
    try {
      await ctx.db.update("booking_attempts", `id=eq.${attemptId}`, patch);
    } catch (e) {
      console.error("booking_attempts update failed", e);
    }
  };
  const common: Row = {
    ...base,
    phone,
    service_name: service.square_name,
    price_cents: service.price_cents,
    trip_fee_cents: area.trip_fee_dollars * 100,
    square_env: ctx.square!.environment,
  };

  try {
    const city = str(args.city) || area.city || "";
    const address = {
      address_line_1: addressLine,
      locality: city,
      administrative_district_level_1: "FL",
      postal_code: zip,
    };
    const email = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(str(args.email)) ? str(args.email) : undefined;

    let customer = await ctx.square!.findCustomerByPhone(phone);
    let customerIsNew = false;
    if (!customer) {
      customer = await ctx.square!.createCustomer({
        idempotency_key: `cust-${attemptId}`,
        ...splitName(name),
        phone_number: phone,
        email_address: email,
        address,
        note: "Created by the AI phone receptionist.",
      });
      customerIsNew = true;
    }

    const cart = str(args.cart);
    const notes = str(args.notes);
    const sellerNote = [
      `Booked by the AI receptionist. Call ${ctx.callId}.`,
      `Address: ${addressLine}, ${city} FL ${zip}`,
      cart ? `Cart: ${cart}` : "",
      area.trip_fee_dollars ? `Trip charge: $${area.trip_fee_dollars} (caller was told)` : "No trip charge",
      `Callback: ${phone}`,
      notes ? `Caller notes: ${notes}` : "",
    ].filter(Boolean).join("\n").slice(0, 4000);

    const booking: Record<string, unknown> = {
      location_id: await ctx.square!.locationId(),
      start_at: new Date(startMs).toISOString(),
      customer_id: customer.id,
      location_type: "CUSTOMER_LOCATION",
      address,
      seller_note: sellerNote,
      customer_note: notes.slice(0, 4000) || undefined,
      appointment_segments: [{
        service_variation_id: service.variation_id,
        service_variation_version: slot.version ?? service.version,
        team_member_id: slot.team_member_id ?? await ctx.square!.teamMemberId(),
        duration_minutes: slot.duration_minutes,
      }],
    };

    let created;
    try {
      created = await ctx.square!.createBooking(String(attemptId), booking);
    } catch (e) {
      // Some sellers do not have "at customer location" enabled. The address is in the note too.
      if (e instanceof SquareError && e.status === 400 && /location_type|address/i.test(e.message)) {
        delete booking.location_type;
        delete booking.address;
        created = await ctx.square!.createBooking(`${attemptId}-b`, booking);
      } else throw e;
    }

    // Did anything else land on the calendar while we were booking?
    let conflict: string | null = null;
    try {
      const day = 24 * 3600 * 1000;
      const around = await ctx.square!.listBookings(new Date(startMs - day), new Date(endMs + day));
      const others = busyIntervals(around.filter((b) => b.id !== created.id));
      if (bufferConflict(ctx.cfg, startMs, endMs, others)) {
        conflict = "Another booking now sits inside the buffer of this one. Check the calendar.";
      }
    } catch (e) {
      console.error("post-booking check failed", e);
    }

    await finish({
      ...common,
      status: "booked",
      start_at: new Date(startMs).toISOString(),
      end_at: new Date(endMs).toISOString(),
      address,
      notes,
      square_customer_id: customer.id,
      square_booking_id: created.id,
      details: { args, customer_is_new: customerIsNew, booking_status: created.status, conflict },
    });

    return {
      ok: true,
      booking_id: created.id,
      booked: {
        service: service.say,
        price: service.price_text,
        trip_charge_dollars: area.trip_fee_dollars,
        when: spokenLabel(new Date(startMs), tz),
      },
      instructions:
        "The appointment is booked. Confirm the day and time once, say payment is taken at the appointment, then call end_call_summary.",
    };
  } catch (e) {
    const reason = e instanceof SquareError ? `${e.code}: ${e.message}` : String(e);
    await finish({ ...common, status: "failed", reason: reason.slice(0, 500) });
    console.error("create_booking failed", e);
    return {
      ok: false,
      reason: "booking_error",
      instructions:
        `The booking did not go through. Do not say it is booked. Apologize, then ${TAKE_MESSAGE} Include the service and the time they wanted.`,
    };
  }
}

// ---------- take_message ----------

const CATEGORIES = [
  "repair",
  "sales",
  "custom_build",
  "booking_request",
  "same_day_request",
  "out_of_area",
  "existing_customer",
  "complaint",
  "emergency",
  "other",
];

export async function takeMessage(ctx: Ctx, args: Args): Promise<ToolResult> {
  const message = str(args.message);
  if (!message) return { ok: false, instructions: "Include the caller's message in `message`, then try again." };
  const category = CATEGORIES.includes(str(args.category)) ? str(args.category) : "other";
  await ctx.db.insert("messages", {
    call_id: ctx.callId,
    caller_name: str(args.caller_name) || null,
    callback_number: toE164(str(args.callback_number)) ?? toE164(ctx.fromNumber) ?? (str(args.callback_number) || null),
    category,
    message,
    service_address: str(args.service_address) || null,
    zip: str(args.zip) || null,
    cart: str(args.cart) || null,
    preferred_times: str(args.preferred_times) || null,
    same_day_request: args.same_day_request === true || category === "same_day_request",
    urgent: args.urgent === true || category === "emergency",
  });
  return {
    ok: true,
    instructions: "Message saved. Tell the caller Nick will call back, usually the same day. Do not promise a specific time.",
  };
}

// ---------- end_call_summary ----------

export async function endCallSummary(ctx: Ctx, args: Args): Promise<ToolResult> {
  await ctx.db.upsert("calls", {
    call_id: ctx.callId,
    caller_name: str(args.caller_name) || null,
    reason_for_call: str(args.reason_for_call) || null,
    outcome: str(args.outcome) || null,
    agent_summary: str(args.summary) || null,
  }, "call_id");
  return { ok: true, instructions: "Saved. Say what happens next in one sentence, say goodbye, and end the call." };
}

// ---------- dispatch ----------

export async function runTool(ctx: Ctx, name: string, args: Args): Promise<ToolResult> {
  switch (name) {
    case "get_services":
      return await getServices(ctx);
    case "check_service_area":
      return checkServiceArea(ctx, args);
    case "find_open_slots":
      return await findOpenSlots(ctx, args);
    case "create_booking":
      return await createBooking(ctx, args);
    case "take_message":
      return await takeMessage(ctx, args);
    case "end_call_summary":
      return await endCallSummary(ctx, args);
    default:
      return { ok: false, instructions: `Unknown tool "${name}".` };
  }
}
