import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  getAgentClaudeConfig,
  getAgentWordPressCredentials,
  serializeProposal,
} from "@/lib/agent-settings";
import { AuthError, requireActiveAgent } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/index";
import {
  campaignBusinesses,
  campaigns,
  leads,
  proposals,
  searches,
} from "@/lib/db/schema";
import {
  DEMO_STATUS_BUILDING,
  DEMO_STATUS_FAILED,
  DEMO_STATUS_READY,
} from "@/lib/demo-status";
import {
  buildClaudeJob,
  ClaudeRoutineError,
  fireClaudeRoutine,
  resolveCallbackBase,
} from "@/lib/integrations/claude-routine";
import {
  cloneTemplateSite,
  WpNetworkError,
  wpDeleteSite,
} from "@/lib/integrations/wp-network";
import { PROPOSAL_STATUS_IN_PROGRESS } from "@/lib/proposal-status";
import { getSearchSettings } from "@/lib/search-proposal-settings";

// Cloning a template site on the WP network can take minutes.
export const maxDuration = 300;

/**
 * POST /api/leads/{leadId}/demo-claude — clones the WP template site through
 * the leadGen plugin (no demoGen), then fires the agent's Claude routine.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ leadId: string }> },
) {
  const { leadId } = await params;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Database is not configured" }, { status: 500 });
  }

  try {
    const agent = await requireActiveAgent();
    const db = getDb();

    const [leadRow] = await db
      .select({
        searchId: leads.searchId,
        searchBusinessId: leads.searchBusinessId,
        title: leads.title,
        phone: leads.phone,
        address: leads.address,
        type: leads.type,
        placeId: leads.placeId,
        industry: searches.industry,
      })
      .from(leads)
      .innerJoin(searches, eq(leads.searchId, searches.id))
      .where(and(eq(leads.id, leadId), eq(searches.agentId, agent.id)))
      .limit(1);

    if (!leadRow) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const placeId = leadRow.placeId?.trim() || "";
    if (!placeId) {
      return NextResponse.json(
        { error: "This lead has no Google place ID to build a demo from." },
        { status: 400 },
      );
    }

    const claude = await getAgentClaudeConfig(agent.id);
    if (!claude.url || !claude.token) {
      return NextResponse.json(
        { error: "Claude is not configured. Add an endpoint and token in Settings." },
        { status: 400 },
      );
    }

    const wp = await getAgentWordPressCredentials(agent.id);
    if (!wp) {
      return NextResponse.json(
        { error: "WordPress is not configured. Add your WP URL and app password in Settings." },
        { status: 400 },
      );
    }

    const [existing] = await db
      .select()
      .from(proposals)
      .where(eq(proposals.leadId, leadId))
      .limit(1);

    if (existing?.status === "sent" || existing?.status === "replied") {
      return NextResponse.json(
        { error: "Cannot create demo for a sent proposal" },
        { status: 400 },
      );
    }

    const searchSettings = await getSearchSettings(leadRow.searchId, agent.id);

    // Template precedence: campaign setting > search setting > industry.
    let campaignTemplate: string | null = null;
    const body = (await request.json().catch(() => null)) as {
      campaignId?: unknown;
    } | null;
    if (typeof body?.campaignId === "string" && leadRow.searchBusinessId) {
      const [campaignRow] = await db
        .select({ demoTemplate: campaigns.demoTemplate })
        .from(campaigns)
        .innerJoin(
          campaignBusinesses,
          eq(campaignBusinesses.campaignId, campaigns.id),
        )
        .where(
          and(
            eq(campaigns.id, body.campaignId),
            eq(campaigns.agentId, agent.id),
            eq(campaignBusinesses.searchBusinessId, leadRow.searchBusinessId),
          ),
        )
        .limit(1);
      campaignTemplate = campaignRow?.demoTemplate?.trim() || null;
    }
    const template =
      campaignTemplate || searchSettings?.demoTemplate || leadRow.industry;
    const jobId = randomUUID();

    if (existing) {
      await db
        .update(proposals)
        .set({
          demoStatus: DEMO_STATUS_BUILDING,
          demoRequestedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(proposals.id, existing.id));
    } else {
      await db.insert(proposals).values({
        leadId,
        body: "",
        status: PROPOSAL_STATUS_IN_PROGRESS,
        demoStatus: DEMO_STATUS_BUILDING,
        demoRequestedAt: new Date(),
      });
    }

    // Recreating replaces the previous Claude clone so sites don't pile up.
    if (existing?.demoProvider === "claude" && existing.wpSiteId != null) {
      await wpDeleteSite(wp, existing.wpSiteId).catch(() => {
        // Already gone or unreachable — carry on with the new clone.
      });
    }

    let site;
    try {
      site = await cloneTemplateSite(
        wp,
        {
          businessName: leadRow.title,
          phone: leadRow.phone,
          address: leadRow.address,
          category: leadRow.type,
        },
        template,
      );
    } catch (cloneError) {
      console.error("[demo-claude] clone failed", { leadId, template, cloneError });
      await db
        .update(proposals)
        .set({ demoStatus: DEMO_STATUS_FAILED, updatedAt: new Date() })
        .where(eq(proposals.leadId, leadId))
        .catch(() => {
          // Best-effort — do not mask the original clone error.
        });
      throw cloneError;
    }

    // Record the clone first so it can always be cleaned up; the demo only
    // becomes visible/ready once the routine has been triggered successfully.
    await db
      .update(proposals)
      .set({
        demoProvider: "claude",
        wpSiteId: site.id,
        claudeJobId: jobId,
        demoGenLeadId: null,
        updatedAt: new Date(),
      })
      .where(eq(proposals.leadId, leadId));

    try {
      await fireClaudeRoutine(
        { url: claude.url, token: claude.token, betaHeader: claude.betaHeader },
        buildClaudeJob({
          jobId,
          demoUrl: site.url,
          callbackBaseUrl: resolveCallbackBase(request.url),
          dryRun: claude.dryRun,
          lead: {
            placeId,
            name: leadRow.title,
            category: leadRow.type,
            address: leadRow.address,
            phone: leadRow.phone,
          },
        }),
      );
    } catch (fireError) {
      console.error("[demo-claude] routine fire failed", { leadId, siteId: site.id, fireError });
      // Routine failed: remove the clone and reset the demo.
      const cleanupFailed = await wpDeleteSite(wp, site.id)
        .then(() => false)
        .catch(() => true);
      await db
        .update(proposals)
        .set({
          demoUrl: null,
          demoStatus: DEMO_STATUS_FAILED,
          demoProvider: null,
          claudeJobId: null,
          wpSiteId: cleanupFailed ? site.id : null,
          updatedAt: new Date(),
        })
        .where(eq(proposals.leadId, leadId));
      const reason =
        fireError instanceof Error ? fireError.message : "Routine could not be started";
      throw new ClaudeRoutineError(
        `Claude routine failed, so the cloned site was ${cleanupFailed ? "NOT removed (delete it manually)" : "deleted"}: ${reason}`,
        fireError instanceof ClaudeRoutineError ? fireError.status : 502,
      );
    }

    const [saved] = await db
      .update(proposals)
      .set({
        demoUrl: site.url,
        demoStatus: DEMO_STATUS_READY,
        updatedAt: new Date(),
      })
      .where(eq(proposals.leadId, leadId))
      .returning();

    return NextResponse.json({
      demoUrl: site.url,
      siteId: site.id,
      warning: null,
      proposal: serializeProposal(saved),
    });
  } catch (error) {
    if (
      error instanceof AuthError ||
      error instanceof WpNetworkError ||
      error instanceof ClaudeRoutineError
    ) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "Failed to create demo with Claude";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
