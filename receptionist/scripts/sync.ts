// Publishes business.yaml.
//
//   deno task sync            validate, write dist/, push the config to Supabase,
//                             and create or update the Retell voice agent
//   deno task sync --dry-run  validate and write dist/ only
//
// Reads keys from receptionist/.env (git-ignored). Never prints them.

import { loadBusiness, renderPrompt, retellAgent, retellTools, runtimeConfig } from "./render.ts";

const root = new URL("../", import.meta.url);
const dryRun = Deno.args.includes("--dry-run");

async function readEnvFile(): Promise<Record<string, string>> {
  const env: Record<string, string> = {};
  try {
    const text = await Deno.readTextFile(new URL(".env", root));
    for (const line of text.split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* no .env yet */ }
  return env;
}

const fileEnv = await readEnvFile();
const env = (k: string) => Deno.env.get(k) ?? fileEnv[k];

const business = loadBusiness(await Deno.readTextFile(new URL("business.yaml", root)));
const config = runtimeConfig(business);
const prompt = renderPrompt(business);
const supabaseUrl = env("SUPABASE_URL") ?? "https://YOUR-PROJECT.supabase.co";
const tools = retellTools(business, `${supabaseUrl}/functions/v1/receptionist/tool`);

await Deno.mkdir(new URL("dist/", root), { recursive: true });
await Deno.writeTextFile(new URL("dist/config.json", root), JSON.stringify(config, null, 2));
await Deno.writeTextFile(new URL("dist/prompt.md", root), prompt);
const fnUrl = `${supabaseUrl}/functions/v1/receptionist`;
const retellLlm = {
  start_speaker: "agent",
  begin_message: config.greeting,
  general_prompt: prompt,
  // Web test calls have no caller number, so give the prompt something sane to print.
  default_dynamic_variables: { user_number: "an unknown number (web test call)" },
  general_tools: [
    ...tools,
    { type: "end_call", name: "end_call", description: "End the call after saying goodbye, or for wrong numbers and sales calls." },
  ],
};
const agent = retellAgent(business, `${fnUrl}/webhook`);
await Deno.writeTextFile(new URL("dist/retell-llm.json", root), JSON.stringify(retellLlm, null, 2));
await Deno.writeTextFile(new URL("dist/retell-agent.json", root), JSON.stringify(agent, null, 2));
// One file with both, ready to POST to .../receptionist/admin/retell-sync.
await Deno.writeTextFile(new URL("dist/retell-sync.json", root), JSON.stringify({ llm: retellLlm, agent }));
console.log(`business.yaml is valid. ${business.services.length} services, prompt is ${prompt.length} characters.`);
console.log("Wrote dist/config.json, dist/prompt.md, dist/retell-llm.json, dist/retell-agent.json");

if (dryRun) Deno.exit(0);

const key = env("SUPABASE_SECRET_KEY");
if (!env("SUPABASE_URL") || !key) {
  console.log("SUPABASE_URL or SUPABASE_SECRET_KEY missing in .env, so nothing was pushed.");
  Deno.exit(1);
}
const headers: Record<string, string> = {
  apikey: key,
  "Content-Type": "application/json",
  Prefer: "resolution=merge-duplicates",
};
if (!key.startsWith("sb_")) headers.Authorization = `Bearer ${key}`;
const res = await fetch(`${supabaseUrl}/rest/v1/receptionist_config?on_conflict=id`, {
  method: "POST",
  headers,
  body: JSON.stringify({ id: 1, config, updated_at: new Date().toISOString() }),
});
if (!res.ok) {
  console.error(`Supabase push failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  Deno.exit(1);
}
console.log("Pushed the config to Supabase. Rule changes are live within a minute.");

// The Retell API key lives only in Supabase, so the Edge Function does the
// Retell calls. We hand it a short-lived token to prove who is asking.
const tokenRes = await fetch(`${supabaseUrl}/rest/v1/selftest_tokens`, {
  method: "POST",
  headers: { ...headers, Prefer: "return=representation" },
  body: JSON.stringify({ expires_at: new Date(Date.now() + 5 * 60_000).toISOString() }),
});
if (!tokenRes.ok) {
  console.error(`Could not create a sync token: ${tokenRes.status}`);
  Deno.exit(1);
}
const [{ token }] = await tokenRes.json();
const retellRes = await fetch(`${fnUrl}/admin/retell-sync`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-selftest-token": token },
  body: JSON.stringify({ llm: retellLlm, agent }),
});
const retell = await retellRes.json().catch(() => ({ ok: false, error: `HTTP ${retellRes.status}` }));
if (!retell.ok) {
  console.error(`Voice agent was NOT updated: ${retell.error}`);
  Deno.exit(1);
}
console.log(`Voice agent ${retell.agent} (${retell.agent_id}). Prompt and tools ${retell.llm}.`);
