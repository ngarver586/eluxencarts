// Turns business.yaml into (1) the runtime config the Edge Function reads,
// (2) the agent prompt, and (3) the tool definitions for the voice platform.

import { parse } from "npm:yaml@2";
import type { Config } from "../supabase/functions/receptionist/lib/rules.ts";
import { parseHHMM } from "../supabase/functions/receptionist/lib/time.ts";

// deno-lint-ignore no-explicit-any
export type Business = Config & Record<string, any>;

export function loadBusiness(yamlText: string): Business {
  const b = parse(yamlText) as Business;
  const problems: string[] = [];
  const need = (cond: unknown, msg: string) => {
    if (!cond) problems.push(msg);
  };
  need(b?.business?.timezone, "business.timezone is required");
  need(b?.summary_email?.to && b?.summary_email?.from, "summary_email.to and .from are required");
  need(typeof b?.greeting === "string" && /AI/i.test(b.greeting) && /record/i.test(b.greeting),
    "greeting must say it is an AI and that the call is recorded");
  try {
    need(parseHHMM(b.hours.open) < parseHHMM(b.hours.close), "hours.open must be before hours.close");
  } catch (e) {
    problems.push(String(e));
  }
  need(Number.isInteger(b?.booking?.earliest_days_ahead) && b.booking.earliest_days_ahead >= 1,
    "booking.earliest_days_ahead must be 1 or more (never same-day)");
  need(b?.booking?.buffer_minutes >= 0, "booking.buffer_minutes is required");
  need(/^\d{5}$/.test(String(b?.service_area?.home_zip)), "service_area.home_zip must be a 5 digit ZIP");
  need(Array.isArray(b?.service_area?.cities) && b.service_area.cities.length, "service_area.cities is required");
  const keys = new Set<string>();
  for (const s of b?.services ?? []) {
    need(/^[a-z0-9_]+$/.test(s.key ?? ""), `service key "${s.key}" must be lowercase letters, digits, underscores`);
    need(!keys.has(s.key), `duplicate service key "${s.key}"`);
    keys.add(s.key);
    need(Array.isArray(s.match) && s.match.length, `service "${s.key}" needs match words`);
    s.match = (s.match ?? []).map(String);
    s.not = (s.not ?? []).map(String);
  }
  for (const text of [b.greeting, b.instructions, ...(b.facts ?? [])]) {
    need(!/—/.test(String(text)), "customer-facing wording must not contain em dashes");
  }
  need(typeof b?.voice?.voice_id === "string" && b.voice.voice_id, "voice.voice_id is required");
  if (problems.length) throw new Error("business.yaml problems:\n- " + problems.join("\n- "));
  b.service_area.home_zip = String(b.service_area.home_zip);
  return b;
}

export function renderPrompt(b: Business): string {
  const tz = b.business.timezone;
  const sa = b.service_area;
  const out: string[] = [String(b.instructions).trim(), ""];

  out.push("## Right now");
  out.push(`Current time: {{current_time_${tz}}}`);
  out.push(`Calendar: {{current_calendar_${tz}}}`);
  out.push("The caller is calling from {{user_number}}. Confirm it is the best callback number. Do not read it out unless asked.");
  out.push("");

  out.push("## Service area");
  out.push(`Bookable cities: ${sa.cities.join(", ")}.`);
  out.push(`No trip charge within ${sa.free_radius_miles} miles of ZIP ${sa.home_zip}. Beyond that the trip charge is ${sa.trip_fee_dollars} dollars.`);
  out.push("Never work out the trip charge yourself. Always use check_service_area.");
  out.push("");

  out.push("## Bookable services");
  out.push("Use these service_key values with find_open_slots and create_booking. Prices come from get_services.");
  for (const s of b.services) out.push(`- ${s.key}: ${s.say}.${s.note ? " " + s.note : ""}`);
  out.push("");

  if (b.quote_only?.rows?.length) {
    out.push("## Installed battery prices (quote only, do not book)");
    out.push(String(b.quote_only.intro ?? ""));
    for (const r of b.quote_only.rows) {
      const prices = Object.entries(r.prices as Record<string, number>)
        .map(([v, p]) => `${v.replace("V", " volt")} ${p} dollars`).join(", ");
      out.push(`- ${r.name}: ${prices}.${r.note ? " " + r.note : ""}`);
    }
    out.push("");
  }

  out.push("## Facts you may share");
  for (const f of b.facts ?? []) out.push(`- ${f}`);
  out.push("");

  out.push("## Never quote or book these. Take a message.");
  for (const m of b.message_only ?? []) out.push(`- ${m}`);
  return out.join("\n").trim() + "\n";
}

/** The runtime config stored in Supabase. Prompt text is left out. */
export function runtimeConfig(b: Business): Config {
  return {
    business: b.business,
    summary_email: b.summary_email,
    greeting: String(b.greeting).trim(),
    hours: b.hours,
    booking: b.booking,
    service_area: { ...b.service_area, zip_overrides: b.service_area.zip_overrides ?? {} },
    services: b.services,
  };
}

/** Agent settings in Retell's create-agent format. The response engine is attached at sync time. */
export function retellAgent(b: Business, webhookUrl: string) {
  const v = b.voice;
  return {
    agent_name: v.agent_name ?? `${b.business.name} receptionist`,
    voice_id: v.voice_id,
    language: v.language ?? "en-US",
    webhook_url: webhookUrl,
    max_call_duration_ms: Math.min(Math.max(Number(v.max_call_minutes ?? 15), 1), 120) * 60_000,
    end_call_after_silence_ms: Math.max(Number(v.hang_up_after_silence_seconds ?? 30), 10) * 1000,
    boosted_keywords: v.boosted_keywords ?? [],
  };
}

const s = (description: string) => ({ type: "string", description });

/** Tool definitions in Retell's custom tool format. */
export function retellTools(b: Business, toolUrl: string) {
  const keys = b.services.map((x) => x.key);
  const tool = (
    name: string,
    description: string,
    properties: Record<string, unknown>,
    required: string[],
    waitMessage?: string,
  ) => ({
    type: "custom",
    name,
    description,
    url: toolUrl,
    method: "POST",
    timeout_ms: 20000,
    speak_after_execution: true,
    speak_during_execution: !!waitMessage,
    ...(waitMessage
      ? { execution_message_type: "static_text", execution_message_description: waitMessage }
      : {}),
    parameters: { type: "object", properties, required },
  });
  return [
    tool("get_services", "Get the current list of bookable services with prices and durations. Call before quoting any service price.", {}, []),
    tool("check_service_area", "Check whether an address is in the service area and whether a trip charge applies. Call as soon as you have the ZIP code.", {
      zip: s("5 digit ZIP code of the service address"),
      city: s("City of the service address, if known"),
    }, []),
    tool("find_open_slots", "Find real open appointment times for one service. Only offer times this returns.", {
      service_key: { type: "string", enum: keys, description: "Which service to book" },
      preferred_date: s("Optional. The day the caller wants, as YYYY-MM-DD in Eastern time"),
      time_of_day: { type: "string", enum: ["morning", "afternoon", "evening", "any"], description: "Optional. Part of the day the caller prefers" },
    }, ["service_key"], "One moment while I check the calendar."),
    tool("create_booking", "Book the appointment. Call only after you read everything back and the caller clearly said yes.", {
      service_key: { type: "string", enum: keys, description: "Which service to book" },
      start_at: s("The start_at value of the chosen time, exactly as returned by find_open_slots"),
      caller_confirmed: { type: "boolean", description: "True only if the caller said yes after the full read-back" },
      customer_name: s("Caller's full name"),
      callback_number: s("Best callback number, digits only"),
      email: s("Email address, only if the caller offered one"),
      address_line: s("Street address where the work will be done"),
      city: s("City of the service address"),
      zip: s("5 digit ZIP code of the service address"),
      cart: s("Cart make and model, and whether it is electric or gas"),
      notes: s("Anything else the caller said that Nick should know"),
    }, ["service_key", "start_at", "caller_confirmed", "customer_name", "callback_number", "address_line", "zip"], "One moment while I book that."),
    tool("take_message", "Save a message for Nick. Use for anything you cannot quote or book, for callers who want a person, and for same-day requests.", {
      caller_name: s("Caller's name"),
      callback_number: s("Best callback number, digits only"),
      category: { type: "string", enum: ["repair", "sales", "custom_build", "booking_request", "same_day_request", "out_of_area", "existing_customer", "complaint", "emergency", "other"], description: "What the message is about" },
      message: s("The full message in plain words: what they need and any details Nick needs to call back prepared"),
      service_address: s("Service address, if given"),
      zip: s("ZIP code, if given"),
      cart: s("Cart make, model and electric or gas, if given"),
      preferred_times: s("Days and times the caller prefers, if any"),
      same_day_request: { type: "boolean", description: "True if the caller wants service today" },
      urgent: { type: "boolean", description: "True for safety issues or a very upset caller" },
    }, ["message", "category"]),
    tool("end_call_summary", "Record the result of the call. Call once, right before saying goodbye.", {
      caller_name: s("Caller's name, if known"),
      reason_for_call: s("One sentence: what the caller wanted"),
      outcome: { type: "string", enum: ["booked", "message_taken", "info_only", "wrong_number", "other"], description: "How the call ended" },
      summary: s("Two or three sentences on what happened and what Nick should do next"),
    }, ["reason_for_call", "outcome"]),
  ];
}
