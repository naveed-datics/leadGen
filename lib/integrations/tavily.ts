import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/index";
import { users } from "@/lib/db/schema";
import { decryptSecret } from "./crypto";

export async function resolveTavilyApiKeyForAgent(agentId: string): Promise<string> {
  const db = getDb();
  const [row] = await db
    .select({ tavilyApiKeyEnc: users.tavilyApiKeyEnc })
    .from(users)
    .where(eq(users.id, agentId));

  const enc = row?.tavilyApiKeyEnc?.trim();
  if (!enc) {
    throw new Error("Tavily API key is not configured. Add it in Settings.");
  }

  const key = decryptSecret(enc).trim();
  if (!key) {
    throw new Error("Tavily API key is not configured. Add it in Settings.");
  }

  return key;
}
