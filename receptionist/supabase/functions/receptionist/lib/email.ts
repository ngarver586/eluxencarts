// Builds and sends the call summary email through Resend's HTTPS API.

import type { Row } from "./db.ts";
import type { Config } from "./rules.ts";
import { spokenLabel } from "./time.ts";

export interface SummaryInput {
  cfg: Config;
  call: Row;
  messages: Row[];
  attempts: Row[];
  mismatches: string[];
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function prettyPhone(e164: unknown): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(String(e164 ?? ""));
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : String(e164 ?? "unknown number");
}

export function buildSummary(input: SummaryInput): { subject: string; text: string; html: string } {
  const { cfg, call, messages, attempts, mismatches } = input;
  const tz = cfg.business.timezone;
  const booked = attempts.filter((a) => a.status === "booked");
  const failed = attempts.filter((a) => a.status === "failed");
  // deno-lint-ignore no-explicit-any
  const analysis = (call.analysis ?? {}) as any;
  const name = String(call.caller_name ?? messages[0]?.caller_name ?? booked[0]?.customer_name ?? "Unknown caller");
  const number = prettyPhone(call.from_number);
  const urgent = messages.some((m) => m.urgent);

  const headline = booked.length
    ? "Booked"
    : failed.length
    ? "Booking FAILED"
    : messages.length
    ? "Message"
    : String(call.outcome ?? "No action");
  const subject = `${urgent ? "URGENT: " : ""}${headline}: ${name}, ${number}`;

  const lines: string[] = [];
  lines.push(`Caller: ${name}`);
  lines.push(`Number: ${number}`);
  if (call.started_at) lines.push(`Call time: ${spokenLabel(new Date(String(call.started_at)), tz)} Eastern`);
  if (call.duration_seconds != null) lines.push(`Length: ${call.duration_seconds} seconds`);
  if (call.disconnection_reason) lines.push(`Ended: ${call.disconnection_reason}`);
  lines.push("");
  lines.push("WHAT THEY WANTED");
  lines.push(String(call.reason_for_call ?? call.agent_summary ?? analysis.call_summary ?? "Not captured."));
  if (call.agent_summary && call.reason_for_call) lines.push(String(call.agent_summary));
  lines.push("");

  lines.push("BOOKED");
  if (!booked.length) lines.push("Nothing was booked.");
  for (const a of booked) {
    // deno-lint-ignore no-explicit-any
    const addr = (a.address ?? {}) as any;
    lines.push(`${a.service_name} on ${spokenLabel(new Date(String(a.start_at)), tz)}`);
    lines.push(`  Price: ${a.price_cents == null ? "confirmed at appointment" : "$" + Number(a.price_cents) / 100}${Number(a.trip_fee_cents) ? ` plus $${Number(a.trip_fee_cents) / 100} trip charge` : ""}`);
    lines.push(`  Customer: ${a.customer_name}, ${prettyPhone(a.phone)}`);
    lines.push(`  Address: ${addr.address_line_1 ?? ""}, ${addr.locality ?? ""} FL ${addr.postal_code ?? ""}`);
    if (a.notes) lines.push(`  Notes: ${a.notes}`);
    lines.push(`  Square booking ID: ${a.square_booking_id} (${a.square_env})`);
    // deno-lint-ignore no-explicit-any
    const conflict = (a.details as any)?.conflict;
    if (conflict) lines.push(`  CHECK THIS: ${conflict}`);
  }
  for (const a of failed) {
    lines.push(`FAILED booking attempt for ${a.service_name ?? a.service_key}: ${a.reason}`);
  }
  lines.push("");

  lines.push("MESSAGES");
  if (!messages.length) lines.push("No message was left.");
  for (const m of messages) {
    lines.push(`[${m.category}${m.urgent ? ", urgent" : ""}${m.same_day_request ? ", wants today" : ""}] ${m.message}`);
    if (m.caller_name || m.callback_number) lines.push(`  From: ${m.caller_name ?? ""} ${prettyPhone(m.callback_number)}`);
    if (m.service_address || m.zip) lines.push(`  Address: ${m.service_address ?? ""} ${m.zip ?? ""}`);
    if (m.cart) lines.push(`  Cart: ${m.cart}`);
    if (m.preferred_times) lines.push(`  Preferred times: ${m.preferred_times}`);
  }
  lines.push("");

  if (mismatches.length) {
    lines.push("SQUARE VS BUSINESS.YAML");
    for (const m of mismatches) lines.push(`- ${m}`);
    lines.push("");
  }
  if (call.recording_url) {
    lines.push(`Recording: ${call.recording_url}`);
    lines.push("");
  }
  lines.push("TRANSCRIPT");
  lines.push(String(call.transcript ?? "No transcript."));

  const text = lines.join("\n");
  const html = `<div style="font-family:system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.5;white-space:pre-wrap">${
    esc(text).replace(
      /^(WHAT THEY WANTED|BOOKED|MESSAGES|SQUARE VS BUSINESS\.YAML|TRANSCRIPT)$/gm,
      "<strong>$1</strong>",
    )
  }</div>`;
  return { subject, text, html };
}

export async function sendEmail(
  apiKey: string,
  msg: { from: string; to: string; subject: string; text: string; html: string },
  f: typeof fetch = fetch,
): Promise<void> {
  const res = await f("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: msg.from, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
}
