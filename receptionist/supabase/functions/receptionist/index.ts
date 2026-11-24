import { handle } from "./lib/app.ts";
import { RestDb, supabaseKeyFromEnv } from "./lib/db.ts";

const env = (k: string) => Deno.env.get(k);
const db = new RestDb(env("SUPABASE_URL")!, supabaseKeyFromEnv(env));

Deno.serve((req) => handle(req, { env, db }));
