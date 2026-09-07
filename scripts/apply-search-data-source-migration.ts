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
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS google_places_api_key_enc text
  `;
  await sql`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS search_data_source text NOT NULL DEFAULT 'serpapi'
  `;
  await sql`
    ALTER TABLE searches
    ADD COLUMN IF NOT EXISTS data_source text
  `;
  await sql`
    ALTER TABLE searches
    ADD COLUMN IF NOT EXISTS api_hits integer NOT NULL DEFAULT 0
  `;
  await sql`
    ALTER TABLE search_businesses
    ADD COLUMN IF NOT EXISTS email text
  `;
  console.log(
    "Applied 005-search-data-source: Google Places key, search_data_source, searches.data_source/api_hits, search_businesses.email",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
