import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/index";
import { socialOutreachJobs } from "@/lib/db/schema";
import { requireSocialAgent } from "@/lib/social-outreach/agent-guard";

const Schema = z.object({
  /** Omit to approve every queued job. */
  jobIds: z.array(z.string().uuid()).min(1).max(500).optional(),
});

export async function POST(request: Request) {
  try {
    const user = await requireSocialAgent();
    const json: unknown = await request.json().catch(() => ({}));
    const parsed = Schema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const updated = await getDb()
      .update(socialOutreachJobs)
      .set({ status: "approved", updatedAt: new Date() })
      .where(
        and(
          eq(socialOutreachJobs.agentId, user.id),
          eq(socialOutreachJobs.status, "queued"),
          parsed.data.jobIds
            ? inArray(socialOutreachJobs.id, parsed.data.jobIds)
            : undefined,
        ),
      )
      .returning({ id: socialOutreachJobs.id });

    return NextResponse.json({ approved: updated.length });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
