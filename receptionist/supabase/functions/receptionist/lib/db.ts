// Tiny PostgREST client. The receptionist only needs inserts, updates,
// simple selects and one RPC, so no SDK is pulled in.

export type Row = Record<string, unknown>;

export interface Db {
  insert(table: string, row: Row): Promise<Row>;
  upsert(table: string, row: Row, onConflict: string): Promise<Row>;
  /** Update rows matching the PostgREST filter, e.g. "call_id=eq.abc". Returns updated rows. */
  update(table: string, filter: string, patch: Row): Promise<Row[]>;
  select(table: string, filter: string): Promise<Row[]>;
  rpc(fn: string, args: Row): Promise<unknown>;
}

export function supabaseKeyFromEnv(env: (k: string) => string | undefined): string {
  const secretKeys = env("SUPABASE_SECRET_KEYS");
  if (secretKeys) {
    try {
      const parsed = JSON.parse(secretKeys);
      if (parsed?.default) return parsed.default;
    } catch { /* fall through to the legacy key */ }
  }
  const legacy = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!legacy) throw new Error("No Supabase secret key in the environment");
  return legacy;
}

export class RestDb implements Db {
  constructor(private url: string, private key: string, private f: typeof fetch = fetch) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const h: Record<string, string> = {
      apikey: this.key,
      "Content-Type": "application/json",
      ...extra,
    };
    // New sb_secret_ keys go on `apikey` only. Legacy JWT keys also need Authorization.
    if (!this.key.startsWith("sb_")) h.Authorization = `Bearer ${this.key}`;
    return h;
  }

  private async req(path: string, init: RequestInit): Promise<unknown> {
    const res = await this.f(`${this.url}/rest/v1/${path}`, init);
    const text = await res.text();
    if (!res.ok) throw new Error(`Database ${res.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  }

  async insert(table: string, row: Row): Promise<Row> {
    const r = await this.req(table, {
      method: "POST",
      headers: this.headers({ Prefer: "return=representation" }),
      body: JSON.stringify(row),
    }) as Row[];
    return r[0];
  }

  async upsert(table: string, row: Row, onConflict: string): Promise<Row> {
    const r = await this.req(`${table}?on_conflict=${onConflict}`, {
      method: "POST",
      headers: this.headers({ Prefer: "return=representation,resolution=merge-duplicates" }),
      body: JSON.stringify(row),
    }) as Row[];
    return r[0];
  }

  async update(table: string, filter: string, patch: Row): Promise<Row[]> {
    return await this.req(`${table}?${filter}`, {
      method: "PATCH",
      headers: this.headers({ Prefer: "return=representation" }),
      body: JSON.stringify(patch),
    }) as Row[];
  }

  async select(table: string, filter: string): Promise<Row[]> {
    return await this.req(`${table}?${filter}`, { method: "GET", headers: this.headers() }) as Row[];
  }

  async rpc(fn: string, args: Row): Promise<unknown> {
    return await this.req(`rpc/${fn}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(args),
    });
  }
}
