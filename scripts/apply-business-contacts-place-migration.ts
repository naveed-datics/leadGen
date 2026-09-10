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
    ALTER TABLE business_contacts
    ADD COLUMN IF NOT EXISTS place_title text
  `;
  await sql`
    ALTER TABLE business_contacts
    ADD COLUMN IF NOT EXISTS place_address text
  `;
  await sql`
    ALTER TABLE business_contacts
    ADD COLUMN IF NOT EXISTS place_phone text
  `;
  await sql`
    ALTER TABLE business_contacts
    ADD COLUMN IF NOT EXISTS place_website text
  `;
  await sql`
    ALTER TABLE business_contacts
    ADD COLUMN IF NOT EXISTS place_id text
  `;
  await sql`
    ALTER TABLE business_contacts
    ADD COLUMN IF NOT EXISTS place_category text
  `;
  await sql`
    ALTER TABLE business_contacts
    ADD COLUMN IF NOT EXISTS place_rating real
  `;
  await sql`
    ALTER TABLE business_contacts
    ADD COLUMN IF NOT EXISTS place_reviews_count integer
  `;
  await sql`
    ALTER TABLE business_contacts
    ADD COLUMN IF NOT EXISTS place_opening_hours jsonb
  `;
  await sql`
    ALTER TABLE business_contacts
    ADD COLUMN IF NOT EXISTS place_raw_json jsonb
  `;
  console.log(
    "Applied 010-business-contacts-place: business_contacts place_* columns (compass/crawler-google-places)",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
