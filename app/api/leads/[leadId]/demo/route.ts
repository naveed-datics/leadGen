import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAgentDemoWebhookConfig, serializeProposal } from "@/lib/agent-settings";
import { getSearchSettings } from "@/lib/search-proposal-settings";
import { AuthError, requireActiveAgent } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/index";
import { leads, proposals, searches } from "@/lib/db/schema";
import {
  requestDemoBuild,
  DemoWebhookError,
  isDemoBuildAccepted,
  type DemoWebhookResponse,
} from "@/lib/integrations/demo-webhook";
import { PROPOSAL_STATUS_IN_PROGRESS } from "@/lib/proposal-status";
import { DEMO_STATUS_BUILDING, DEMO_STATUS_FAILED, DEMO_STATUS_READY } from "@/lib/demo-status";

// The demo webhook's own pipeline can take minutes (clone -> AI-fill -> brand),
// and we now poll asynchronously within this route.
// Capped at 300 - Vercel Hobby plan's serverless function limit.
export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ leadId: string }> },
) {
  const { leadId } = await params;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "Database is not configured" },
      { status: 500 },
    );
  }

  try {
    const agent = await requireActiveAgent();
    const db = getDb();

    const [leadRow] = await db
      .select({
        leadId: leads.id,
        searchId: leads.searchId,
        title: leads.title,
        phone: leads.phone,
        mapsUrl: leads.mapsUrl,
        industry: searches.industry,
        location: searches.location,
      })
      .from(leads)
      .innerJoin(searches, eq(leads.searchId, searches.id))
      .where(and(eq(leads.id, leadId), eq(searches.agentId, agent.id)))
      .limit(1);

    if (!leadRow) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const searchSettings = await getSearchSettings(leadRow.searchId, agent.id);

    if (!searchSettings?.demoEnabled) {
      return NextResponse.json(
        { error: "Demo is not enabled for this search. Turn it on in search Settings." },
        { status: 400 },
      );
    }

    if (!leadRow.mapsUrl) {
      return NextResponse.json(
        { error: "This lead has no Google Business Profile URL to build a demo from." },
        { status: 400 },
      );
    }

    const webhookConfig = await getAgentDemoWebhookConfig(agent.id);

    const [existingBeforeBuild] = await db
      .select()
      .from(proposals)
      .where(eq(proposals.leadId, leadId))
      .limit(1);

    if (
      existingBeforeBuild?.status === "sent" ||
      existingBeforeBuild?.status === "replied"
    ) {
      return NextResponse.json(
        { error: "Cannot create demo for a sent proposal" },
        { status: 400 },
      );
    }

    if (existingBeforeBuild) {
      await db
        .update(proposals)
        .set({
          demoStatus: DEMO_STATUS_BUILDING,
          demoRequestedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(proposals.id, existingBeforeBuild.id));
    } else {
      await db.insert(proposals).values({
        leadId,
        body: "",
        status: PROPOSAL_STATUS_IN_PROGRESS,
        demoStatus: DEMO_STATUS_BUILDING,
        demoRequestedAt: new Date(),
      });
    }

    let buildResult: DemoWebhookResponse | Awaited<ReturnType<typeof requestDemoBuild>>;
    try {
      buildResult = await requestDemoBuild({
        googleBusinessProfileUrl: leadRow.mapsUrl,
        template: searchSettings.demoTemplate || leadRow.industry,
        leadId,
        callbackUrl: new URL("/api/webhooks/demo-url", request.url).toString(),
        webhookConfig,
      });
    } catch (buildError) {
      await db
        .update(proposals)
        .set({ demoStatus: DEMO_STATUS_FAILED, updatedAt: new Date() })
        .where(eq(proposals.leadId, leadId))
        .catch(() => {
          // Best-effort — do not mask the original build error.
        });
      throw buildError;
    }

    // Async: demoGen builds in the background and POSTs the demo URL back.
    if (isDemoBuildAccepted(buildResult)) {
      const [buildingProposal] = await db
        .select()
        .from(proposals)
        .where(eq(proposals.leadId, leadId))
        .limit(1);

      return NextResponse.json(
        {
          accepted: true,
          message:
            buildResult.message ||
            "Demo is building in the background. The demo URL will appear when the finish callback runs.",
          proposal: buildingProposal
            ? serializeProposal(buildingProposal)
            : { leadId, demoStatus: DEMO_STATUS_BUILDING },
        },
        { status: 202 },
      );
    }

    const webhookResponse: DemoWebhookResponse = buildResult;

    const demoUrl = webhookResponse.demoUrl;

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

    let proposal;
    if (existing) {
      [proposal] = await db
        .update(proposals)
        .set({
          demoUrl,
          demoStatus: DEMO_STATUS_READY,
          updatedAt: new Date(),
        })
        .where(eq(proposals.id, existing.id))
        .returning();
    } else {
      [proposal] = await db
        .insert(proposals)
        .values({
          leadId,
          body: "",
          status: PROPOSAL_STATUS_IN_PROGRESS,
          demoUrl,
          demoStatus: DEMO_STATUS_READY,
        })
        .returning();
    }

    return NextResponse.json({
      demoUrl,
      siteId: webhookResponse.siteId,
      template: webhookResponse.template,
      pagesFilled: webhookResponse.pagesFilled,
      photosUploaded: webhookResponse.photosUploaded,
      warnings: webhookResponse.warnings,
      proposal: serializeProposal(proposal),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof DemoWebhookError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "Failed to create demo site";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
