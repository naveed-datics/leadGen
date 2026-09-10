import { neon } from "@neondatabase/serverless";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function loadEnvFile(filename: string): void {
  const path = resolve(process.cwd(), filename);
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const sql = neon(databaseUrl);

async function main() {
  await sql`
    ALTER TABLE search_businesses
    ADD COLUMN IF NOT EXISTS website_http_status integer
  `;
  await sql`
    ALTER TABLE search_businesses
    ADD COLUMN IF NOT EXISTS website_check_state text
  `;
  await sql`
    ALTER TABLE search_businesses
    ADD COLUMN IF NOT EXISTS website_checked_at timestamptz
  `;
  await sql`
    ALTER TABLE search_businesses
    ADD COLUMN IF NOT EXISTS copyright_text text
  `;
  await sql`
    ALTER TABLE search_businesses
    ADD COLUMN IF NOT EXISTS copyright_year integer
  `;
  console.log(
    "Applied 007-website-health: search_businesses.website_http_status/website_check_state/website_checked_at/copyright_text/copyright_year",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
