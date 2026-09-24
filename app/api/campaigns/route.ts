import { and, count, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireAuth } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/index";
import {
  CAMPAIGN_STATUSES,
  campaignBusinesses,
  campaigns,
  searchBusinesses,
  searches,
} from "@/lib/db/schema";

type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

const CreateCampaignSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  businessIds: z.array(z.string().uuid()).min(1),
});

/** Campaigns whose businesses are still considered "currently taken". */
const ACTIVE_STATUSES = ["draft", "active"] as const;

export async function GET(request: Request) {
  try {
    const user = await requireAuth();
    const db = getDb();

    const url = new URL(request.url);
    const statusParam = url.searchParams.get("status");
    const statuses = statusParam
      ? statusParam.split(",").filter((s) => CAMPAIGN_STATUSES.includes(s as CampaignStatus))
      : null;

    const filters = [
      user.role === "agent" ? eq(campaigns.agentId, user.id) : undefined,
      statuses && statuses.length > 0 ? inArray(campaigns.status, statuses) : undefined,
    ].filter((f): f is Exclude<typeof f, undefined> => f !== undefined);

    const rows = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        description: campaigns.description,
        status: campaigns.status,
        createdAt: campaigns.createdAt,
        updatedAt: campaigns.updatedAt,
        businessCount: count(campaignBusinesses.id),
      })
      .from(campaigns)
      .leftJoin(campaignBusinesses, eq(campaignBusinesses.campaignId, campaigns.id))
      .where(filters.length > 0 ? and(...filters) : undefined)
      .groupBy(campaigns.id)
      .orderBy(campaigns.createdAt);

    return NextResponse.json({
      campaigns: rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        status: row.status,
        businessCount: Number(row.businessCount),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "Failed to load campaigns";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth();

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = CreateCampaignSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { name, description, businessIds } = parsed.data;
    const db = getDb();

    // Ownership check: every business must belong to a search owned by this agent.
    const ownedRows = await db
      .select({ id: searchBusinesses.id })
      .from(searchBusinesses)
      .innerJoin(searches, eq(searchBusinesses.searchId, searches.id))
      .where(
        and(
          inArray(searchBusinesses.id, businessIds),
          user.role === "agent" ? eq(searches.agentId, user.id) : undefined,
        ),
      );
    const ownedIds = new Set(ownedRows.map((row) => row.id));
    const notOwned = businessIds.filter((id) => !ownedIds.has(id));
    if (notOwned.length > 0) {
      return NextResponse.json(
        { error: "Some businesses were not found", businessIds: notOwned },
        { status: 404 },
      );
    }

    // Re-validate exclusivity server-side: reject if any business currently
    // belongs to another draft/active campaign (race-safe check).
    const takenRows = await db
      .select({ searchBusinessId: campaignBusinesses.searchBusinessId })
      .from(campaignBusinesses)
      .innerJoin(campaigns, eq(campaigns.id, campaignBusinesses.campaignId))
      .where(
        and(
          inArray(campaignBusinesses.searchBusinessId, businessIds),
          inArray(campaigns.status, [...ACTIVE_STATUSES]),
        ),
      );

    if (takenRows.length > 0) {
      return NextResponse.json(
        {
          error: "Some businesses already belong to another active campaign",
          businessIds: takenRows.map((row) => row.searchBusinessId),
        },
        { status: 409 },
      );
    }

    const [campaign] = await db
      .insert(campaigns)
      .values({
        agentId: user.id,
        name,
        description: description ?? null,
        status: "draft",
      })
      .returning();

    if (!campaign) {
      throw new Error("Failed to create campaign");
    }

    await db.insert(campaignBusinesses).values(
      businessIds.map((searchBusinessId) => ({
        campaignId: campaign.id,
        searchBusinessId,
      })),
    );

    return NextResponse.json(
      {
        campaign: {
          id: campaign.id,
          name: campaign.name,
          description: campaign.description,
          status: campaign.status,
          businessCount: businessIds.length,
          createdAt: campaign.createdAt.toISOString(),
          updatedAt: campaign.updatedAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "Failed to create campaign";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
