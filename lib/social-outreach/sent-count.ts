import { and, count, eq, gte } from "drizzle-orm";
import { getDb } from "@/lib/db/index";
import { socialOutreachJobs } from "@/lib/db/schema";
import { capWindowStart } from "./cap";

/** Facebook DMs sent by this agent in the last rolling 24 hours. */
export async function countSentInWindow(agentId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(socialOutreachJobs)
    .where(
      and(
        eq(socialOutreachJobs.agentId, agentId),
        eq(socialOutreachJobs.channel, "facebook"),
        eq(socialOutreachJobs.status, "sent"),
        gte(socialOutreachJobs.sentAt, capWindowStart()),
      ),
    );
  return Number(row?.value ?? 0);
}
