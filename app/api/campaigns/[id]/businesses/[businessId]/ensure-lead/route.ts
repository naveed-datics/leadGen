import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/index";
import { campaignBusinesses, leads, searchBusinesses, searches } from "@/lib/db/schema";

type RouteContext = { params: Promise<{ id: string; businessId: string }> };

/**
 * Ensures a `leads` row exists for this business so demo/proposal creation
 * (which require a leadId) can proceed even when no socials were ever found
 * for it — unlike the lazy insert in app/api/businesses/[id]/route.ts and
 * find-socials, this always creates one, unconditionally.
 */
export async function POST(_request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { id: campaignId, businessId } = await context.params;
    const db = getDb();

    const [membership] = await db
      .select({ id: campaignBusinesses.id })
      .from(campaignBusinesses)
      .where(
        and(
          eq(campaignBusinesses.campaignId, campaignId),
          eq(campaignBusinesses.searchBusinessId, businessId),
        ),
      )
      .limit(1);

    if (!membership) {
      return NextResponse.json(
        { error: "Business is not part of this campaign" },
        { status: 404 },
      );
    }

    const [business] = await db
      .select({
        id: searchBusinesses.id,
        title: searchBusinesses.title,
        phone: searchBusinesses.phone,
        address: searchBusinesses.address,
        placeId: searchBusinesses.placeId,
        rating: searchBusinesses.rating,
        reviews: searchBusinesses.reviews,
        type: searchBusinesses.type,
        mapsUrl: searchBusinesses.mapsUrl,
        thumbnail: searchBusinesses.thumbnail,
        latitude: searchBusinesses.latitude,
        longitude: searchBusinesses.longitude,
        searchId: searchBusinesses.searchId,
      })
      .from(searchBusinesses)
      .innerJoin(searches, eq(searchBusinesses.searchId, searches.id))
      .where(
        and(
          eq(searchBusinesses.id, businessId),
          user.role === "agent" ? eq(searches.agentId, user.id) : undefined,
        ),
      )
      .limit(1);

    if (!business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    const [existingLead] = await db
      .select({ id: leads.id })
      .from(leads)
      .where(eq(leads.searchBusinessId, business.id))
      .limit(1);

    if (existingLead) {
      return NextResponse.json({ leadId: existingLead.id });
    }

    const [createdLead] = await db
      .insert(leads)
      .values({
        searchId: business.searchId,
        searchBusinessId: business.id,
        title: business.title,
        placeId: business.placeId,
        address: business.address,
        phone: business.phone,
        rating: business.rating,
        reviews: business.reviews,
        type: business.type,
        mapsUrl: business.mapsUrl,
        thumbnail: business.thumbnail,
        latitude: business.latitude,
        longitude: business.longitude,
        socials: null,
      })
      .returning({ id: leads.id });

    if (!createdLead) {
      throw new Error("Failed to create lead");
    }

    return NextResponse.json({ leadId: createdLead.id });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "Failed to ensure lead";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
