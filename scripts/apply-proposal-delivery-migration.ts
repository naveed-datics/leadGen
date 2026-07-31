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
    ALTER TABLE proposals
    ADD COLUMN IF NOT EXISTS delivered_at timestamptz
  `;
  await sql`
    ALTER TABLE proposals
    ADD COLUMN IF NOT EXISTS read_at timestamptz
  `;
  await sql`
    ALTER TABLE proposals
    ADD COLUMN IF NOT EXISTS outbound_wa_message_id text
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS whatsapp_messages_wa_message_id_idx
    ON whatsapp_messages (wa_message_id)
  `;
  console.log(
    "Added proposals.delivered_at, read_at, outbound_wa_message_id + message id index.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
