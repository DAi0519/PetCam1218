import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const wranglerPath = path.join(root, "wrangler.jsonc");
const wranglerConfig = fs.readFileSync(wranglerPath, "utf8");

if (process.env.SKIP_CF_VERIFY === "1") {
  process.exit(0);
}

const placeholderDatabaseId = /"database_id"\s*:\s*"0{8}-0{4}-0{4}-0{4}-0{12}"/;
if (placeholderDatabaseId.test(wranglerConfig)) {
  console.error("wrangler.jsonc still contains the placeholder D1 database_id.");
  console.error("Run `npm run cf:bootstrap` after `wrangler login`, or replace it manually before deploying.");
  process.exit(1);
}

const hasD1Binding = /"binding"\s*:\s*"DB"/.test(wranglerConfig);
if (!hasD1Binding) {
  console.error("wrangler.jsonc is missing the DB D1 binding.");
  process.exit(1);
}

console.log("Cloudflare deployment config looks ready.");
