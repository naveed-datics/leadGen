import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireAuth } from "@/lib/auth/guards";
import { computeCampaignResults } from "@/lib/campaigns/results";
import { getDb } from "@/lib/db/index";
import {
  CAMPAIGN_STATUSES,
  campaignBusinesses,
  campaigns,
  leads,
  searchBusinesses,
  searches,
} from "@/lib/db/schema";

type RouteContext = { params: Promise<{ id: string }> };

const PatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  status: z.enum(CAMPAIGN_STATUSES).optional(),
});

/** Forward-only lifecycle: draft -> active -> completed/archived (terminal). */
const ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
  draft: ["draft", "active", "completed", "archived"],
  active: ["active", "completed", "archived"],
  completed: ["completed"],
  archived: ["archived"],
};

async function loadCampaign(
  db: ReturnType<typeof getDb>,
  id: string,
  userId: string,
  role: string,
) {
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(
      and(
        eq(campaigns.id, id),
        role === "agent" ? eq(campaigns.agentId, userId) : undefined,
      ),
    )
    .limit(1);
  return campaign ?? null;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { id } = await context.params;
    const db = getDb();

    const campaign = await loadCampaign(db, id, user.id, user.role);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const businessRows = await db
      .select({
        id: searchBusinesses.id,
        title: searchBusinesses.title,
        industry: searches.industry,
        location: searches.location,
        phone: searchBusinesses.phone,
        email: searchBusinesses.email,
        website: searchBusinesses.website,
        hasWebsite: searchBusinesses.hasWebsite,
        websiteCheckState: searchBusinesses.websiteCheckState,
        websiteHttpStatus: searchBusinesses.websiteHttpStatus,
        websiteCheckedAt: searchBusinesses.websiteCheckedAt,
        copyrightText: searchBusinesses.copyrightText,
        copyrightYear: searchBusinesses.copyrightYear,
        contactsFound: searchBusinesses.contactsFound,
        contactsStatus: searchBusinesses.contactsStatus,
        contactsVerifiedAt: searchBusinesses.contactsVerifiedAt,
        address: searchBusinesses.address,
        rating: searchBusinesses.rating,
        reviews: searchBusinesses.reviews,
        mapsUrl: searchBusinesses.mapsUrl,
        searchId: searchBusinesses.searchId,
        createdAt: searchBusinesses.createdAt,
        demoEnabled: searches.demoEnabled,
        demoTemplate: searches.demoTemplate,
        leadId: leads.id,
        leadPlaceId: leads.placeId,
        leadHasWhatsapp: leads.hasWhatsapp,
      })
      .from(campaignBusinesses)
      .innerJoin(
        searchBusinesses,
        eq(campaignBusinesses.searchBusinessId, searchBusinesses.id),
      )
      .innerJoin(searches, eq(searchBusinesses.searchId, searches.id))
      .leftJoin(leads, eq(leads.searchBusinessId, searchBusinesses.id))
      .where(eq(campaignBusinesses.campaignId, id))
      .orderBy(searchBusinesses.createdAt);

    const results = await computeCampaignResults(db, id);

    return NextResponse.json({
      campaign: {
        id: campaign.id,
        name: campaign.name,
        description: campaign.description,
        status: campaign.status,
        createdAt: campaign.createdAt.toISOString(),
        updatedAt: campaign.updatedAt.toISOString(),
      },
      results,
      businesses: businessRows.map((row) => ({
        id: row.id,
        title: row.title,
        industry: row.industry,
        location: row.location,
        phone: row.phone,
        email: row.email,
        website: row.website,
        hasWebsite: row.hasWebsite,
        websiteCheckState: row.websiteCheckState,
        websiteHttpStatus: row.websiteHttpStatus,
        websiteCheckedAt: row.websiteCheckedAt?.toISOString() ?? null,
        copyrightText: row.copyrightText,
        copyrightYear: row.copyrightYear,
        contactsFound: row.contactsFound,
        contactsStatus: row.contactsStatus,
        contactsVerifiedAt: row.contactsVerifiedAt?.toISOString() ?? null,
        address: row.address,
        rating: row.rating,
        reviews: row.reviews,
        mapsUrl: row.mapsUrl,
        searchId: row.searchId,
        createdAt: row.createdAt.toISOString(),
        demoEnabled: row.demoEnabled,
        demoTemplate: row.demoTemplate,
        leadId: row.leadId,
        leadPlaceId: row.leadPlaceId,
        hasWhatsapp: row.leadHasWhatsapp,
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "Failed to load campaign";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { id } = await context.params;
    const db = getDb();

    const campaign = await loadCampaign(db, id, user.id, user.role);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = PatchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { name, description, status } = parsed.data;

    if (status && !ALLOWED_TRANSITIONS[campaign.status]?.includes(status)) {
      return NextResponse.json(
        { error: `Cannot move campaign from "${campaign.status}" to "${status}"` },
        { status: 400 },
      );
    }

    const [updated] = await db
      .update(campaigns)
      .set({
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(status !== undefined ? { status } : {}),
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, id))
      .returning();

    if (!updated) {
      throw new Error("Failed to update campaign");
    }

    return NextResponse.json({
      campaign: {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        status: updated.status,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "Failed to update campaign";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { id } = await context.params;
    const db = getDb();

    const campaign = await loadCampaign(db, id, user.id, user.role);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    if (campaign.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft campaigns can be deleted. Archive it instead." },
        { status: 400 },
      );
    }

    await db.delete(campaigns).where(eq(campaigns.id, id));

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "Failed to delete campaign";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
