import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/index";
import { remainingToday } from "@/lib/social-outreach/cap";
import {
  extensionErrorResponse,
  requireExtensionAgent,
} from "@/lib/social-outreach/extension-auth";
import { countSentInWindow } from "@/lib/social-outreach/sent-count";

/** A claimed job that never reported back is considered failed after this. */
const STALE_SENDING_MINUTES = 10;

interface ClaimedJob extends Record<string, unknown> {
  id: string;
  target_url: string;
  body: string;
  search_business_id: string;
}

/** Claims the next approved job for this agent (POST because it mutates). */
export async function POST(request: Request) {
  try {
    const agent = await requireExtensionAgent(request);
    const db = getDb();

    await db.execute(sql`
      UPDATE social_outreach_jobs
      SET status = 'failed', reason = 'timeout', updated_at = now()
      WHERE agent_id = ${agent.id}
        AND status = 'sending'
        AND updated_at < now() - make_interval(mins => ${STALE_SENDING_MINUTES})
    `);

    const sent = await countSentInWindow(agent.id);
    if (remainingToday(agent.fbDailyCap, sent) <= 0) {
      return NextResponse.json({ job: null, reason: "daily_cap_reached" });
    }

    const result = await db.execute<ClaimedJob>(sql`
      UPDATE social_outreach_jobs
      SET status = 'sending', attempts = attempts + 1, updated_at = now()
      WHERE id = (
        SELECT id FROM social_outreach_jobs
        WHERE agent_id = ${agent.id}
          AND channel = 'facebook'
          AND status = 'approved'
          AND (scheduled_for IS NULL OR scheduled_for <= now())
          AND NOT EXISTS (
            SELECT 1 FROM social_outreach_jobs s
            WHERE s.agent_id = ${agent.id} AND s.status = 'sending'
          )
        ORDER BY created_at
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, target_url, body, search_business_id
    `);

    const row = result.rows[0];
    if (!row) return NextResponse.json({ job: null, reason: "no_jobs" });

    return NextResponse.json({
      job: {
        id: row.id,
        targetUrl: row.target_url,
        body: row.body,
        businessId: row.search_business_id,
      },
    });
  } catch (error) {
    return extensionErrorResponse(error);
  }
}
