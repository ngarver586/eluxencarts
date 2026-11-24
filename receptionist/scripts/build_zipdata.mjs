// Rebuilds lib/zipdata.ts. Run from this folder after `npm i zipcodes`:
//   node build_zipdata.mjs
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const z = createRequire(import.meta.url)("zipcodes");
const rows = z.radius("32081", 60, true).filter((r) => r.state === "FL")
  .sort((a, b) => a.zip.localeCompare(b.zip));
let out =
  "// Generated from the public `zipcodes` npm dataset: Florida ZIP codes within 60 miles of 32081.\n// zip -> [postal city, latitude, longitude]. Regenerate with scripts/build_zipdata.mjs.\nexport const ZIPS: Record<string, [string, number, number]> = {\n";
for (const r of rows) out += `  "${r.zip}": [${JSON.stringify(r.city)}, ${r.latitude}, ${r.longitude}],\n`;
out += "};\n";
writeFileSync(new URL("../supabase/functions/receptionist/lib/zipdata.ts", import.meta.url), out);
console.log(`wrote ${rows.length} ZIP codes`);
