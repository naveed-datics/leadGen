import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/index";
import { users } from "@/lib/db/schema";
import { decryptSecret } from "./crypto";

export async function resolveSerpApiKeyForAgent(agentId: string): Promise<string> {
  const db = getDb();
  const [row] = await db
    .select({ serpApiKeyEnc: users.serpApiKeyEnc })
    .from(users)
    .where(eq(users.id, agentId));

  const enc = row?.serpApiKeyEnc?.trim();
  if (!enc) {
    throw new Error("SerpApi key is not configured. Add it in Settings.");
  }

  const key = decryptSecret(enc).trim();
  if (!key) {
    throw new Error("SerpApi key is not configured. Add it in Settings.");
  }

  return key;
}

