import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { desc, eq, isNotNull, and } from "drizzle-orm";
import {
  getAgentClaudeConfig,
  getAgentWordPressCredentials,
} from "@/lib/agent-settings";
import { getDb } from "@/lib/db/index";
import { leads, searches } from "@/lib/db/schema";
import { AuthError, requireActiveAgent } from "@/lib/auth/guards";
import {
  buildClaudeJob,
  ClaudeRoutineError,
  fireClaudeRoutine,
  resolveCallbackBase,
} from "@/lib/integrations/claude-routine";

/**
 * POST /api/agent/settings/claude/test — fires the saved routine once with a
 * forced dry-run sample job (no site is cloned) to prove the trigger works.
 */
export async function POST(request: Request) {
  try {
    const agent = await requireActiveAgent();
    const claude = await getAgentClaudeConfig(agent.id);
    if (!claude.url || !claude.token) {
      return NextResponse.json(
        { error: "Save a Claude endpoint and token first." },
        { status: 400 },
      );
    }

    // Use the agent's own WP host (routines usually allow-list it) and their
    // most recent real lead so the routine has genuine data to work with.
    const wp = await getAgentWordPressCredentials(agent.id);
    const [lead] = await getDb()
      .select({
        placeId: leads.placeId,
        title: leads.title,
        type: leads.type,
        address: leads.address,
        phone: leads.phone,
      })
      .from(leads)
      .innerJoin(searches, eq(leads.searchId, searches.id))
      .where(and(eq(searches.agentId, agent.id), isNotNull(leads.placeId)))
      .orderBy(desc(leads.createdAt))
      .limit(1);

    const jobId = `test-${randomUUID()}`;
    const job = buildClaudeJob({
      jobId,
      demoUrl: wp ? `${wp.baseUrl.replace(/\/+$/, "")}/` : "https://example.com/dry-run-test/",
      callbackBaseUrl: resolveCallbackBase(request.url),
      dryRun: true,
      lead: lead
        ? {
            placeId: lead.placeId!,
            name: lead.title,
            category: lead.type,
            address: lead.address,
            phone: lead.phone,
          }
        : {
            placeId: "TEST_PLACE_ID",
            name: "LeadGen Routine Test",
            category: "Test",
            address: "1 Test Street",
            phone: "",
          },
    });

    const response = await fireClaudeRoutine(
      { url: claude.url, token: claude.token, betaHeader: claude.betaHeader },
      job,
    );

    return NextResponse.json({
      ok: true,
      jobId,
      message: `Routine triggered with a dry-run test job (${lead ? `lead: ${lead.title}` : "no leads yet, sample business"}; demo host: ${new URL(job.demo_url).host}; callback: ${new URL(job.options.callback_url).origin}).`,
      response,
    });
  } catch (error) {
    if (error instanceof AuthError || error instanceof ClaudeRoutineError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "Failed to trigger the routine";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
