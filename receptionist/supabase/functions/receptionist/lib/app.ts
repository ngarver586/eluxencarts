// Request handling for the receptionist Edge Function.
//   POST .../receptionist/tool     tool calls from the voice agent (signed by Retell)
//   POST .../receptionist/webhook  call events from Retell (signed by Retell)
//   GET  .../receptionist/health   what is configured; never returns secrets
//   POST .../receptionist/selftest sandbox-only tool runner for testing without a phone call

import type { Db, Row } from "./db.ts";
import { buildSummary, sendEmail } from "./email.ts";
import { verifyRetellSignature } from "./retell.ts";
import { type Config, matchServices } from "./rules.ts";
import { Square } from "./square.ts";
import { type Ctx, loadServices, runTool } from "./tools.ts";

export interface Deps {
  env: (key: string) => string | undefined;
  db: Db;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let squareClient: { key: string; client: Square } | null = null;

function getSquare(deps: Deps): Square | null {
  const token = deps.env("SQUARE_ACCESS_TOKEN");
  if (!token) return null;
  const environment = deps.env("SQUARE_ENV") === "production" ? "production" : "sandbox";
  const key = `${environment}:${token.length}:${token.slice(-4)}`;
  if (!squareClient || squareClient.key !== key || deps.fetchImpl) {
    squareClient = {
      key,
      client: new Square({
        token,
        environment,
        locationId: deps.env("SQUARE_LOCATION_ID") || undefined,
        teamMemberId: deps.env("SQUARE_TEAM_MEMBER_ID") || undefined,
        fetchImpl: deps.fetchImpl,
      }),
    };
  }
  return squareClient.client;
}

let configCache: { at: number; cfg: Config } | null = null;

export async function loadConfig(db: Db, maxAgeMs = 60_000): Promise<Config> {
  if (configCache && Date.now() - configCache.at < maxAgeMs) return configCache.cfg;
  const rows = await db.select("receptionist_config", "id=eq.1&select=config");
  if (!rows.length) throw new Error("receptionist_config is empty. Run the sync script.");
  configCache = { at: Date.now(), cfg: rows[0].config as Config };
  return configCache.cfg;
}

export function clearCaches() {
  configCache = null;
  squareClient = null;
}

async function handleTool(deps: Deps, raw: string): Promise<Response> {
  // deno-lint-ignore no-explicit-any
  const body = JSON.parse(raw) as any;
  const name = String(body.name ?? "");
  const args = (body.args ?? {}) as Record<string, unknown>;
  const call = body.call ?? {};
  const started = Date.now();
  const cfg = await loadConfig(deps.db);
  const ctx: Ctx = {
    cfg,
    square: getSquare(deps),
    db: deps.db,
    now: deps.now ?? (() => new Date()),
    callId: String(call.call_id ?? "unknown"),
    fromNumber: call.from_number,
  };
  let result: Record<string, unknown>;
  try {
    result = await runTool(ctx, name, args);
  } catch (e) {
    console.error(`tool ${name} crashed`, e);
    result = {
      ok: false,
      instructions:
        "Something went wrong on our side. Do not guess. Take a message with take_message and say Nick will call back, usually the same day.",
    };
  }
  try {
    await deps.db.insert("tool_calls", {
      call_id: ctx.callId,
      tool: name,
      args,
      result,
      ms: Date.now() - started,
    });
  } catch (e) {
    console.error("tool_calls insert failed", e);
  }
  return json(result);
}

function callRow(call: Record<string, unknown>): Row {
  const start = Number(call.start_timestamp) || null;
  const end = Number(call.end_timestamp) || null;
  const row: Row = {
    call_id: String(call.call_id),
    from_number: call.from_number ?? null,
    to_number: call.to_number ?? null,
    direction: call.direction ?? null,
  };
  if (start) row.started_at = new Date(start).toISOString();
  if (end) row.ended_at = new Date(end).toISOString();
  if (start && end) row.duration_seconds = Math.round((end - start) / 1000);
  if (call.disconnection_reason) row.disconnection_reason = call.disconnection_reason;
  if (typeof call.transcript === "string") row.transcript = call.transcript;
  if (call.recording_url) row.recording_url = call.recording_url;
  if (call.call_analysis) row.analysis = call.call_analysis;
  return row;
}

async function sendSummary(deps: Deps, callId: string): Promise<"sent" | "skipped" | "already"> {
  const apiKey = deps.env("RESEND_API_KEY");
  // Claim the send so a retried webhook cannot email twice.
  const claimed = await deps.db.update(
    "calls",
    `call_id=eq.${encodeURIComponent(callId)}&email_sent_at=is.null`,
    { email_sent_at: new Date().toISOString() },
  );
  if (!claimed.length) return "already";
  try {
    const cfg = await loadConfig(deps.db);
    const id = encodeURIComponent(callId);
    const [messages, attempts] = await Promise.all([
      deps.db.select("messages", `call_id=eq.${id}&order=created_at.asc`),
      deps.db.select("booking_attempts", `call_id=eq.${id}&order=created_at.asc`),
    ]);
    let mismatches: string[] = [];
    const square = getSquare(deps);
    if (square) {
      try {
        mismatches = (await loadServices({ cfg, square } as Ctx)).mismatches;
      } catch (e) {
        mismatches = [`Could not read the Square service list: ${String(e).slice(0, 200)}`];
      }
    }
    const summary = buildSummary({ cfg, call: claimed[0], messages, attempts, mismatches });
    if (!apiKey) {
      console.log("RESEND_API_KEY not set, summary not emailed:", summary.subject);
      await deps.db.update("calls", `call_id=eq.${id}`, { email_sent_at: null, email_status: "no_api_key" });
      return "skipped";
    }
    await sendEmail(apiKey, {
      from: cfg.summary_email.from,
      to: cfg.summary_email.to,
      ...summary,
    }, deps.fetchImpl);
    await deps.db.update("calls", `call_id=eq.${id}`, { email_status: "sent" });
    return "sent";
  } catch (e) {
    // Release the claim so Retell's retry can try again.
    await deps.db.update("calls", `call_id=eq.${encodeURIComponent(callId)}`, {
      email_sent_at: null,
      email_status: `error: ${String(e).slice(0, 200)}`,
    });
    throw e;
  }
}

async function handleWebhook(deps: Deps, raw: string): Promise<Response> {
  // deno-lint-ignore no-explicit-any
  const body = JSON.parse(raw) as any;
  const event = String(body.event ?? "");
  const call = body.call;
  if (!call?.call_id) return new Response(null, { status: 204 });
  if (["call_started", "call_ended", "call_analyzed"].includes(event)) {
    await deps.db.upsert("calls", callRow(call), "call_id");
  }
  // call_analyzed is the last event Retell sends and carries the transcript and analysis.
  if (event === "call_analyzed") await sendSummary(deps, String(call.call_id));
  return new Response(null, { status: 204 });
}

// Lets a tester run the same tools the voice agent uses, without Retell.
// Refused outright in production. Needs a short-lived token from the
// selftest_tokens table, which only the database owner can create.
async function handleSelftest(deps: Deps, req: Request): Promise<Response> {
  if (deps.env("SQUARE_ENV") === "production") return json({ error: "not found" }, 404);
  const token = req.headers.get("x-selftest-token") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(token)) return json({ error: "unauthorized" }, 401);
  const nowIso = (deps.now ?? (() => new Date()))().toISOString();
  const rows = await deps.db.select(
    "selftest_tokens",
    `token=eq.${token}&expires_at=gt.${encodeURIComponent(nowIso)}&select=token`,
  );
  if (!rows.length) return json({ error: "unauthorized" }, 401);
  // deno-lint-ignore no-explicit-any
  const body = JSON.parse(await req.text()) as any;
  if (body.name === "diagnostics") return json(await diagnostics(deps));
  const call = body.call ?? {};
  return await handleTool(
    deps,
    JSON.stringify({
      name: body.name,
      args: body.args ?? {},
      call: { call_id: `selftest-${String(call.call_id ?? "1")}`, from_number: call.from_number },
    }),
  );
}

/** What Square actually returns, next to how business.yaml matched it. No secrets. */
async function diagnostics(deps: Deps): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  const square = getSquare(deps);
  if (!square) return { square_token_set: false };
  const step = async (key: string, fn: () => Promise<unknown>) => {
    try {
      out[key] = await fn();
    } catch (e) {
      out[key] = { error: String(e).slice(0, 300) };
    }
  };
  out.square_env = square.environment;
  await step("seller_writes", () => square.sellerWritesSupported());
  await step("location_id", () => square.locationId());
  await step("team_member_id", () => square.teamMemberId());
  await step("services", async () => {
    const cfg = await loadConfig(deps.db, 0);
    const variations = await square.listServiceVariations();
    const { services, mismatches } = matchServices(cfg, variations);
    return {
      in_square: variations.map((v) => ({
        name: `${v.item_name} / ${v.variation_name}`,
        price_cents: v.price_cents,
        duration_minutes: v.duration_minutes,
        bookable: v.available_for_booking,
      })),
      matched: services.map((s) => ({
        key: s.key,
        square_name: s.square_name,
        price: s.price_text,
        duration_minutes: s.duration_minutes,
      })),
      mismatches,
    };
  });
  return out;
}

async function handleHealth(deps: Deps): Promise<Response> {
  const out: Record<string, unknown> = {
    retell_key_set: !!deps.env("RETELL_API_KEY"),
    resend_key_set: !!deps.env("RESEND_API_KEY"),
    square_token_set: !!deps.env("SQUARE_ACCESS_TOKEN"),
    square_env: deps.env("SQUARE_ENV") === "production" ? "production" : "sandbox",
  };
  try {
    const cfg = await loadConfig(deps.db, 0);
    out.config_loaded = true;
    out.booking_enabled = cfg.booking.enabled;
    const square = getSquare(deps);
    if (square) {
      try {
        out.square_seller_writes = await square.sellerWritesSupported();
        const { services, mismatches } = await loadServices({ cfg, square } as Ctx);
        out.bookable_services = services.length;
        out.mismatch_count = mismatches.length;
        out.square_ok = true;
      } catch (e) {
        out.square_ok = false;
        out.square_error = String(e).slice(0, 200);
      }
    }
  } catch (e) {
    out.config_loaded = false;
    out.config_error = String(e).slice(0, 200);
  }
  return json(out);
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  try {
    if (req.method === "GET" && path.endsWith("/health")) return await handleHealth(deps);
    if (req.method === "POST" && path.endsWith("/selftest")) return await handleSelftest(deps, req);
    if (req.method !== "POST" || !(path.endsWith("/tool") || path.endsWith("/webhook"))) {
      return json({ error: "not found" }, 404);
    }
    const apiKey = deps.env("RETELL_API_KEY");
    if (!apiKey) return json({ error: "receptionist is not configured" }, 503);
    const raw = await req.text();
    const now = (deps.now ?? (() => new Date()))().getTime();
    if (!(await verifyRetellSignature(raw, apiKey, req.headers.get("x-retell-signature"), now))) {
      return json({ error: "unauthorized" }, 401);
    }
    return path.endsWith("/tool") ? await handleTool(deps, raw) : await handleWebhook(deps, raw);
  } catch (e) {
    console.error("request failed", e);
    return json({ error: "internal error" }, 500);
  }
}
