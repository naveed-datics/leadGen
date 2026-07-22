import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { serializeProposal } from "@/lib/agent-settings";
import { getSearchSettings } from "@/lib/search-proposal-settings";
import { AuthError, requireActiveAgent } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/index";
import { leads, proposals, searches } from "@/lib/db/schema";
import { createDemoSite } from "@/lib/integrations/demo-webhook";
import { PROPOSAL_STATUS_IN_PROGRESS } from "@/lib/proposal-status";

export async function POST(
  _request: Request,
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

    const webhookResponse = await createDemoSite({
      googleBusinessProfileUrl: leadRow.mapsUrl,
      template: leadRow.industry,
    });

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
    const message =
      error instanceof Error ? error.message : "Failed to create demo site";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
