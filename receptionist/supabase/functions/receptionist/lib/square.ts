// Minimal Square API client: only the calls the receptionist needs.
// Docs checked 2026-11-24 against Square-Version 2026-11-18.

import type { SquareVariation } from "./rules.ts";

export const SQUARE_VERSION = "2026-11-18";

export class SquareError extends Error {
  constructor(public status: number, public code: string, detail: string) {
    super(`Square ${status} ${code}: ${detail}`);
  }
}

export interface SquareBooking {
  id: string;
  version: number;
  status: string;
  start_at: string;
  location_id?: string;
  customer_id?: string;
  appointment_segments?: { duration_minutes: number; team_member_id?: string }[];
}

export interface SquareOptions {
  token: string;
  environment: "sandbox" | "production";
  locationId?: string;
  teamMemberId?: string;
  fetchImpl?: typeof fetch;
}

interface Cached<T> {
  at: number;
  value: T;
}

export class Square {
  private base: string;
  private f: typeof fetch;
  private cache = new Map<string, Cached<unknown>>();

  constructor(private opts: SquareOptions) {
    this.base = opts.environment === "production"
      ? "https://connect.squareup.com"
      : "https://connect.squareupsandbox.com";
    this.f = opts.fetchImpl ?? fetch;
  }

  get environment() {
    return this.opts.environment;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.f(this.base + path, {
      method,
      headers: {
        "Authorization": `Bearer ${this.opts.token}`,
        "Square-Version": SQUARE_VERSION,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    // deno-lint-ignore no-explicit-any
    let json: any = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { errors: [{ code: "BAD_RESPONSE", detail: text.slice(0, 200) }] };
    }
    if (!res.ok || json.errors?.length) {
      const e = json.errors?.[0] ?? {};
      throw new SquareError(res.status, e.code ?? "UNKNOWN", e.detail ?? "no detail");
    }
    return json as T;
  }

  private async cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key) as Cached<T> | undefined;
    if (hit && Date.now() - hit.at < ttlMs) return hit.value;
    const value = await load();
    this.cache.set(key, { at: Date.now(), value });
    return value;
  }

  /** True only when the seller's plan lets this app create and cancel bookings. */
  sellerWritesSupported(): Promise<boolean> {
    return this.cached("profile", 60_000, async () => {
      // deno-lint-ignore no-explicit-any
      const r = await this.call<any>("GET", "/v2/bookings/business-booking-profile");
      return r.business_booking_profile?.support_seller_level_writes === true;
    });
  }

  locationId(): Promise<string> {
    if (this.opts.locationId) return Promise.resolve(this.opts.locationId);
    return this.cached("location", 600_000, async () => {
      // deno-lint-ignore no-explicit-any
      const r = await this.call<any>("GET", "/v2/locations");
      // deno-lint-ignore no-explicit-any
      const active = (r.locations ?? []).filter((l: any) => l.status === "ACTIVE");
      if (active.length !== 1) {
        throw new SquareError(
          0,
          "LOCATION_AMBIGUOUS",
          `Expected exactly one active location, found ${active.length}. Set SQUARE_LOCATION_ID.`,
        );
      }
      return active[0].id as string;
    });
  }

  teamMemberId(): Promise<string> {
    if (this.opts.teamMemberId) return Promise.resolve(this.opts.teamMemberId);
    return this.cached("team", 600_000, async () => {
      const loc = await this.locationId();
      // deno-lint-ignore no-explicit-any
      const r = await this.call<any>(
        "GET",
        `/v2/bookings/team-member-booking-profiles?bookable_only=true&location_id=${loc}`,
      );
      const members = r.team_member_booking_profiles ?? [];
      if (members.length !== 1) {
        throw new SquareError(
          0,
          "TEAM_AMBIGUOUS",
          `Expected exactly one bookable team member, found ${members.length}. Set SQUARE_TEAM_MEMBER_ID.`,
        );
      }
      return members[0].team_member_id as string;
    });
  }

  /** Every appointment service variation in the Square catalog. */
  listServiceVariations(): Promise<SquareVariation[]> {
    return this.cached("catalog", 300_000, async () => {
      const out: SquareVariation[] = [];
      let cursor: string | undefined;
      do {
        // deno-lint-ignore no-explicit-any
        const r = await this.call<any>("POST", "/v2/catalog/search-catalog-items", {
          product_types: ["APPOINTMENTS_SERVICE"],
          limit: 100,
          cursor,
        });
        for (const item of r.items ?? []) {
          for (const v of item.item_data?.variations ?? []) {
            const d = v.item_variation_data ?? {};
            const fixed = d.pricing_type !== "VARIABLE_PRICING" && d.price_money;
            out.push({
              variation_id: v.id,
              version: v.version,
              item_name: item.item_data?.name ?? "",
              variation_name: d.name ?? "",
              price_cents: fixed ? Number(d.price_money.amount) : null,
              duration_minutes: d.service_duration ? Math.round(d.service_duration / 60000) : null,
              available_for_booking: d.available_for_booking === true,
              team_member_ids: d.team_member_ids ?? [],
            });
          }
        }
        cursor = r.cursor;
      } while (cursor);
      return out;
    });
  }

  /** Open start times Square itself would offer for this service. */
  async searchAvailability(
    variationId: string,
    startAt: Date,
    endAt: Date,
  ): Promise<{ start_at: string; duration_minutes: number; version: number; team_member_id: string }[]> {
    const [loc, team] = await Promise.all([this.locationId(), this.teamMemberId()]);
    // deno-lint-ignore no-explicit-any
    const r = await this.call<any>("POST", "/v2/bookings/availability/search", {
      query: {
        filter: {
          location_id: loc,
          start_at_range: { start_at: startAt.toISOString(), end_at: endAt.toISOString() },
          segment_filters: [{
            service_variation_id: variationId,
            team_member_id_filter: { any: [team] },
          }],
        },
      },
    });
    // deno-lint-ignore no-explicit-any
    return (r.availabilities ?? []).map((a: any) => ({
      start_at: a.start_at,
      duration_minutes: a.appointment_segments?.[0]?.duration_minutes,
      version: a.appointment_segments?.[0]?.service_variation_version,
      team_member_id: a.appointment_segments?.[0]?.team_member_id,
    }));
  }

  /** Every booking on the seller's calendar in the range (max 31 days). */
  async listBookings(startMin: Date, startMax: Date): Promise<SquareBooking[]> {
    const loc = await this.locationId();
    const out: SquareBooking[] = [];
    let cursor: string | undefined;
    do {
      const q = new URLSearchParams({
        location_id: loc,
        start_at_min: startMin.toISOString(),
        start_at_max: startMax.toISOString(),
        limit: "100",
      });
      if (cursor) q.set("cursor", cursor);
      // deno-lint-ignore no-explicit-any
      const r = await this.call<any>("GET", `/v2/bookings?${q}`);
      out.push(...(r.bookings ?? []));
      cursor = r.cursor;
    } while (cursor);
    return out;
  }

  async findCustomerByPhone(e164: string): Promise<{ id: string } | null> {
    // deno-lint-ignore no-explicit-any
    const r = await this.call<any>("POST", "/v2/customers/search", {
      query: { filter: { phone_number: { exact: e164 } } },
      limit: 1,
    });
    return r.customers?.[0] ? { id: r.customers[0].id } : null;
  }

  async createCustomer(c: {
    idempotency_key: string;
    given_name?: string;
    family_name?: string;
    phone_number: string;
    email_address?: string;
    address?: Record<string, string>;
    note?: string;
  }): Promise<{ id: string }> {
    // deno-lint-ignore no-explicit-any
    const r = await this.call<any>("POST", "/v2/customers", c);
    return { id: r.customer.id };
  }

  async createBooking(idempotencyKey: string, booking: Record<string, unknown>): Promise<SquareBooking> {
    // deno-lint-ignore no-explicit-any
    const r = await this.call<any>("POST", "/v2/bookings", {
      idempotency_key: idempotencyKey,
      booking,
    });
    return r.booking as SquareBooking;
  }

  async cancelBooking(id: string, version: number): Promise<SquareBooking> {
    // deno-lint-ignore no-explicit-any
    const r = await this.call<any>("POST", `/v2/bookings/${id}/cancel`, {
      booking_version: version,
    });
    return r.booking as SquareBooking;
  }
}

const ACTIVE_STATUSES = new Set(["ACCEPTED", "PENDING"]);

/** Turn Square bookings into busy intervals, ignoring cancelled and declined ones. */
export function busyIntervals(bookings: SquareBooking[]): { start: number; end: number }[] {
  return bookings
    .filter((b) => ACTIVE_STATUSES.has(b.status))
    .map((b) => {
      const start = Date.parse(b.start_at);
      const minutes = (b.appointment_segments ?? []).reduce(
        (sum, s) => sum + (s.duration_minutes ?? 0),
        0,
      );
      return { start, end: start + Math.max(minutes, 1) * 60_000 };
    });
}
