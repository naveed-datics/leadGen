import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/index";
import { socialOutreachJobs } from "@/lib/db/schema";
import {
  extensionErrorResponse,
  requireExtensionAgent,
} from "@/lib/social-outreach/extension-auth";

const FAILURE_REASONS = [
  "no_message_button",
  "messaging_disabled",
  "not_logged_in",
  "action_blocked",
  "send_unconfirmed",
  "page_unavailable",
  "error",
] as const;

const ResultSchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("sent") }),
  z.object({
    outcome: z.enum(["failed", "skipped"]),
    reason: z.enum(FAILURE_REASONS),
  }),
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const agent = await requireExtensionAgent(request);
    const { id } = await params;

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = ResultSchema.safeParse(json);
    if (!parsed.success || !z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const now = new Date();
    const result = parsed.data;
    const values =
      result.outcome === "sent"
        ? { status: "sent", sentAt: now, reason: null, updatedAt: now }
        : { status: result.outcome, reason: result.reason, updatedAt: now };

    const updated = await getDb()
      .update(socialOutreachJobs)
      .set(values)
      .where(
        and(
          eq(socialOutreachJobs.id, id),
          eq(socialOutreachJobs.agentId, agent.id),
          eq(socialOutreachJobs.status, "sending"),
        ),
      )
      .returning({ id: socialOutreachJobs.id });

    if (updated.length === 0) {
      return NextResponse.json(
        { error: "Job not found or not in sending state" },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return extensionErrorResponse(error);
  }
}
