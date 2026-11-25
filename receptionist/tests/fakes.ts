// In-memory stand-ins for Square, Supabase and Resend so every rule can be
// tested without touching a real account.

import type { Db, Row } from "../supabase/functions/receptionist/lib/db.ts";
import type { Config } from "../supabase/functions/receptionist/lib/rules.ts";
import { loadBusiness, runtimeConfig } from "../scripts/render.ts";

export async function loadTestConfig(): Promise<Config> {
  const text = await Deno.readTextFile(new URL("../business.yaml", import.meta.url));
  return runtimeConfig(loadBusiness(text));
}

export class FakeDb implements Db {
  tables: Record<string, Row[]> = {
    receptionist_config: [],
    calls: [],
    messages: [],
    booking_attempts: [],
    tool_calls: [],
    selftest_tokens: [],
  };
  private n = 0;

  private match(row: Row, filter: string): boolean {
    for (const part of filter.split("&")) {
      const [col, cond] = part.split("=");
      if (col === "select" || col === "order") continue;
      const value = decodeURIComponent(cond.replace(/^(eq|is|gt)\./, ""));
      if (cond.startsWith("gt.")) {
        if (!(String(row[col]) > value)) return false;
      } else if (cond.startsWith("is.null")) {
        if (row[col] != null) return false;
      } else if (String(row[col]) !== value) return false;
    }
    return true;
  }
  insert(table: string, row: Row): Promise<Row> {
    const r = { id: `id-${++this.n}`, created_at: new Date().toISOString(), ...row };
    this.tables[table].push(r);
    return Promise.resolve(r);
  }
  upsert(table: string, row: Row, onConflict: string): Promise<Row> {
    const existing = this.tables[table].find((r) => r[onConflict] === row[onConflict]);
    if (existing) {
      Object.assign(existing, row);
      return Promise.resolve(existing);
    }
    return this.insert(table, row);
  }
  update(table: string, filter: string, patch: Row): Promise<Row[]> {
    const rows = this.tables[table].filter((r) => this.match(r, filter));
    rows.forEach((r) => Object.assign(r, patch));
    return Promise.resolve(rows.map((r) => ({ ...r })));
  }
  select(table: string, filter: string): Promise<Row[]> {
    return Promise.resolve(this.tables[table].filter((r) => this.match(r, filter)));
  }
  rpc(fn: string, args: Row): Promise<unknown> {
    if (fn !== "claim_slot") throw new Error(`unknown rpc ${fn}`);
    const start = Date.parse(String(args.p_start));
    const end = Date.parse(String(args.p_end));
    const buf = Number(args.p_buffer_minutes) * 60_000;
    const clash = this.tables.booking_attempts.some((b) =>
      (b.status === "pending" || b.status === "booked") &&
      Date.parse(String(b.start_at)) < end + buf && Date.parse(String(b.end_at)) > start - buf
    );
    if (clash) return Promise.resolve(null);
    const id = `attempt-${++this.n}`;
    this.tables.booking_attempts.push({
      id,
      call_id: args.p_call_id,
      status: "pending",
      start_at: args.p_start,
      end_at: args.p_end,
      created_at: new Date().toISOString(),
    });
    return Promise.resolve(id);
  }
}

export interface FakeSquareState {
  sellerWrites: boolean;
  // deno-lint-ignore no-explicit-any
  catalog: any[];
  availability: { start_at: string; duration_minutes: number }[];
  // deno-lint-ignore no-explicit-any
  bookings: any[];
  // deno-lint-ignore no-explicit-any
  customers: any[];
  calls: { method: string; path: string }[];
  emails: unknown[];
  failCreateBooking?: boolean;
}

export function service(id: string, name: string, variation: string, dollars: number | null, minutes: number) {
  return {
    id: `item-${id}`,
    item_data: {
      name,
      product_type: "APPOINTMENTS_SERVICE",
      variations: [{
        id,
        version: 100,
        item_variation_data: {
          name: variation,
          pricing_type: dollars === null ? "VARIABLE_PRICING" : "FIXED_PRICING",
          ...(dollars === null ? {} : { price_money: { amount: dollars * 100, currency: "USD" } }),
          service_duration: minutes * 60000,
          available_for_booking: true,
          team_member_ids: ["TM1"],
        },
      }],
    },
  };
}

export function newSquareState(): FakeSquareState {
  return {
    sellerWrites: true,
    catalog: [
      service("V_MAINT_E", "Maintenance", "Electric cart", 189, 90),
      service("V_MAINT_G", "Maintenance", "Gas cart", 219, 90),
      service("V_DIAG", "Diagnostic or lithium battery check", "Regular", 99, 60),
      service("V_SIG4", "Signature detail", "4-seat", 149, 120),
    ],
    availability: [],
    bookings: [],
    customers: [],
    calls: [],
    emails: [],
  };
}

/** A fetch() that answers like Square and Resend, backed by the state above. */
export function fakeFetch(state: FakeSquareState): typeof fetch {
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
  return ((input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    state.calls.push({ method, path: url.pathname });

    if (url.hostname === "api.resend.com") {
      state.emails.push(body);
      return Promise.resolve(ok({ id: "email-1" }));
    }
    const p = url.pathname;
    if (p === "/v2/bookings/business-booking-profile") {
      return Promise.resolve(ok({ business_booking_profile: { support_seller_level_writes: state.sellerWrites } }));
    }
    if (p === "/v2/locations") return Promise.resolve(ok({ locations: [{ id: "LOC1", status: "ACTIVE" }] }));
    if (p === "/v2/bookings/team-member-booking-profiles") {
      return Promise.resolve(ok({ team_member_booking_profiles: [{ team_member_id: "TM1", is_bookable: true }] }));
    }
    if (p === "/v2/catalog/search-catalog-items") return Promise.resolve(ok({ items: state.catalog }));
    if (p === "/v2/bookings/availability/search") {
      const f = body.query.filter;
      const from = Date.parse(f.start_at_range.start_at);
      const to = Date.parse(f.start_at_range.end_at);
      return Promise.resolve(ok({
        availabilities: state.availability
          .filter((a) => Date.parse(a.start_at) >= from && Date.parse(a.start_at) < to)
          .map((a) => ({
            start_at: a.start_at,
            location_id: "LOC1",
            appointment_segments: [{
              duration_minutes: a.duration_minutes,
              team_member_id: "TM1",
              service_variation_id: f.segment_filters[0].service_variation_id,
              service_variation_version: 100,
            }],
          })),
      }));
    }
    if (p === "/v2/bookings" && method === "GET") {
      const from = Date.parse(url.searchParams.get("start_at_min")!);
      const to = Date.parse(url.searchParams.get("start_at_max")!);
      return Promise.resolve(ok({
        bookings: state.bookings.filter((b) => Date.parse(b.start_at) >= from && Date.parse(b.start_at) <= to),
      }));
    }
    if (p === "/v2/bookings" && method === "POST") {
      if (state.failCreateBooking) {
        return Promise.resolve(
          new Response(JSON.stringify({ errors: [{ code: "INTERNAL_SERVER_ERROR", detail: "boom" }] }), { status: 500 }),
        );
      }
      const b = { id: `BK${state.bookings.length + 1}`, version: 0, status: "ACCEPTED", ...body.booking };
      state.bookings.push(b);
      return Promise.resolve(ok({ booking: b }));
    }
    if (p === "/v2/customers/search") {
      const phone = body.query.filter.phone_number.exact;
      return Promise.resolve(ok({ customers: state.customers.filter((c) => c.phone_number === phone) }));
    }
    if (p === "/v2/customers") {
      const c = { id: `CUST${state.customers.length + 1}`, ...body };
      state.customers.push(c);
      return Promise.resolve(ok({ customer: c }));
    }
    return Promise.resolve(new Response(JSON.stringify({ errors: [{ code: "NOT_FOUND", detail: p }] }), { status: 404 }));
  }) as typeof fetch;
}
