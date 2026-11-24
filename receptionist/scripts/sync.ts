// Publishes business.yaml.
//
//   deno task sync            validate, write dist/, and push the config to Supabase
//   deno task sync --dry-run  validate and write dist/ only
//
// Reads keys from receptionist/.env (git-ignored). Never prints them.

import { loadBusiness, renderPrompt, retellTools, runtimeConfig } from "./render.ts";

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
await Deno.writeTextFile(
  new URL("dist/retell-llm.json", root),
  JSON.stringify({
    start_speaker: "agent",
    begin_message: config.greeting,
    general_prompt: prompt,
    general_tools: [
      ...tools,
      { type: "end_call", name: "end_call", description: "End the call after saying goodbye, or for wrong numbers and sales calls." },
    ],
  }, null, 2),
);
console.log(`business.yaml is valid. ${business.services.length} services, prompt is ${prompt.length} characters.`);
console.log("Wrote dist/config.json, dist/prompt.md, dist/retell-llm.json");

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
