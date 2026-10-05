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
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS claude_routine_url text`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS claude_routine_token_enc text`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS claude_beta_header text`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS demo_provider text NOT NULL DEFAULT 'demoapp'`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS claude_dry_run boolean NOT NULL DEFAULT true`;
  await sql`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS demo_provider text`;
  await sql`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS claude_job_id text`;
  await sql`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS wp_site_id integer`;
  console.log("Added Claude demo columns to users and proposals.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
