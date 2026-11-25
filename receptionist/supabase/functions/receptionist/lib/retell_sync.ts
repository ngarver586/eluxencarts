// Creates or updates the Retell voice agent from the files scripts/sync.ts
// writes to dist/. It runs inside the Edge Function because that is the only
// place the Retell API key lives. Docs checked 2026-11-25:
// docs.retellai.com/api-references/create-retell-llm and /create-agent.

import type { Db } from "./db.ts";

const API = "https://api.retellai.com";

export interface RetellSyncDeps {
  env: (key: string) => string | undefined;
  db: Db;
  fetchImpl?: typeof fetch;
}

// deno-lint-ignore no-explicit-any
type Json = any;

export async function retellSync(deps: RetellSyncDeps, body: Json): Promise<Record<string, unknown>> {
  const key = deps.env("RETELL_API_KEY");
  if (!key) return { ok: false, error: "RETELL_API_KEY is not set in Supabase secrets." };
  const f = deps.fetchImpl ?? fetch;
  const call = async (method: string, path: string, payload?: unknown): Promise<Json> => {
    const res = await f(API + path, {
      method,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Retell ${method} ${path.split("/")[1]} ${res.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : {};
  };

  try {
    if (body?.op === "voices") {
      const voices = await call("GET", "/list-voices") as Json[];
      return {
        ok: true,
        voices: voices.map((v) => ({
          voice_id: v.voice_id,
          name: v.voice_name,
          provider: v.provider,
          accent: v.accent,
          gender: v.gender,
          age: v.age,
        })),
      };
    }
    if (!body?.llm || !body?.agent) return { ok: false, error: "Send { llm, agent } or { op: \"voices\" }." };

    const rows = await deps.db.select("integration_state", "key=eq.retell&select=value");
    const state = { ...((rows[0]?.value ?? {}) as Record<string, string>) };
    const save = () =>
      deps.db.upsert("integration_state", { key: "retell", value: state, updated_at: new Date().toISOString() }, "key");
    const did: Record<string, string> = {};

    if (state.llm_id) {
      await call("PATCH", `/update-retell-llm/${state.llm_id}`, body.llm);
      did.llm = "updated";
    } else {
      state.llm_id = (await call("POST", "/create-retell-llm", body.llm)).llm_id;
      await save();
      did.llm = "created";
    }
    const agent = { ...body.agent, response_engine: { type: "retell-llm", llm_id: state.llm_id } };
    if (state.agent_id) {
      await call("PATCH", `/update-agent/${state.agent_id}`, agent);
      did.agent = "updated";
    } else {
      state.agent_id = (await call("POST", "/create-agent", agent)).agent_id;
      await save();
      did.agent = "created";
    }
    return { ok: true, llm_id: state.llm_id, agent_id: state.agent_id, ...did };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 400) };
  }
}
