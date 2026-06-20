import { processDueFollowUps } from "../lib/proposal-follow-up-sequence";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not configured");
    process.exit(1);
  }

  const result = await processDueFollowUps();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
