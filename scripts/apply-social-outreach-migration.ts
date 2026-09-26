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
      ADD COLUMN IF NOT EXISTS social_messaging_enabled boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS fb_daily_cap integer NOT NULL DEFAULT 10,
      ADD COLUMN IF NOT EXISTS extension_token_hash text
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS social_outreach_jobs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      agent_id uuid NOT NULL
        REFERENCES users (id) ON DELETE CASCADE,
      search_business_id uuid NOT NULL
        REFERENCES search_businesses (id) ON DELETE CASCADE,
      lead_id uuid
        REFERENCES leads (id) ON DELETE SET NULL,
      campaign_id uuid
        REFERENCES campaigns (id) ON DELETE SET NULL,
      channel text NOT NULL DEFAULT 'facebook',
      target_url text NOT NULL,
      body text NOT NULL,
      status text NOT NULL DEFAULT 'queued',
      reason text,
      attempts integer NOT NULL DEFAULT 0,
      scheduled_for timestamptz,
      sent_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS social_outreach_jobs_agent_status_idx
    ON social_outreach_jobs (agent_id, status)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS social_outreach_jobs_business_idx
    ON social_outreach_jobs (search_business_id)
  `;
  console.log("Applied 011-social-outreach: users columns, social_outreach_jobs table");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
