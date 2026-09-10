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
    ADD COLUMN IF NOT EXISTS contacts_verified_at timestamptz
  `;
  await sql`
    ALTER TABLE search_businesses
    ADD COLUMN IF NOT EXISTS contacts_found integer
  `;
  await sql`
    ALTER TABLE search_businesses
    ADD COLUMN IF NOT EXISTS contacts_status text
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS business_contacts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      search_business_id uuid NOT NULL
        REFERENCES search_businesses (id) ON DELETE CASCADE,
      name text NOT NULL,
      job_title text,
      linkedin_url text,
      email text,
      email_confidence text,
      email_pattern text,
      phone text,
      phone_source text,
      source text,
      scraped_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS business_contacts_business_idx
    ON business_contacts (search_business_id)
  `;
  console.log(
    "Applied 008-business-contacts: search_businesses.contacts_verified_at/contacts_found/contacts_status, business_contacts table",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
