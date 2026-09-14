import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireAuth } from "@/lib/auth/guards";
import {
  applyBusinessEnrichment,
  markBusinessEnrichError,
} from "@/lib/business-enrich";
import { getDb } from "@/lib/db/index";
import { businessContacts, searchBusinesses, searches } from "@/lib/db/schema";

export const maxDuration = 300;

/** Don't re-run a lookup that succeeded within this window unless force=true. */
const REVERIFY_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

const BodySchema = z.object({
  force: z.boolean().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

/** Every stored field — the popup shows all of them. */
const CONTACT_COLUMNS = {
  id: businessContacts.id,
  source: businessContacts.source,
  facebookUrl: businessContacts.facebookUrl,
  instagramUrl: businessContacts.instagramUrl,
  reviewsJson: businessContacts.reviewsJson,
  photoUrls: businessContacts.photoUrls,
  matchConfidence: businessContacts.matchConfidence,
  matchNotes: businessContacts.matchNotes,
  tavilyRawJson: businessContacts.tavilyRawJson,
  createdAt: businessContacts.createdAt,
} as const;

async function loadContacts(businessId: string) {
  const db = getDb();
  return db
    .select(CONTACT_COLUMNS)
    .from(businessContacts)
    .where(eq(businessContacts.searchBusinessId, businessId))
    .orderBy(asc(businessContacts.createdAt));
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { id } = await context.params;

    if (!process.env.DATABASE_URL) {
      return NextResponse.json(
        { error: "Database is not configured" },
        { status: 500 },
      );
    }

    let json: unknown = {};
    try {
      json = await request.json();
    } catch {
      json = {};
    }
    const parsed = BodySchema.safeParse(json ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const db = getDb();

    const [business] = await db
      .select({
        id: searchBusinesses.id,
        searchId: searchBusinesses.searchId,
        title: searchBusinesses.title,
        address: searchBusinesses.address,
        placeId: searchBusinesses.placeId,
        phone: searchBusinesses.phone,
        website: searchBusinesses.website,
        rating: searchBusinesses.rating,
        reviews: searchBusinesses.reviews,
        type: searchBusinesses.type,
        mapsUrl: searchBusinesses.mapsUrl,
        thumbnail: searchBusinesses.thumbnail,
        latitude: searchBusinesses.latitude,
        longitude: searchBusinesses.longitude,
        contactsVerifiedAt: searchBusinesses.contactsVerifiedAt,
        contactsStatus: searchBusinesses.contactsStatus,
      })
      .from(searchBusinesses)
      .innerJoin(searches, eq(searchBusinesses.searchId, searches.id))
      .where(
        and(
          eq(searchBusinesses.id, id),
          user.role === "agent" ? eq(searches.agentId, user.id) : undefined,
        ),
      )
      .limit(1);

    if (!business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    const force = parsed.data.force ?? false;
    const recentlyOk =
      business.contactsStatus === "ok" &&
      business.contactsVerifiedAt != null &&
      Date.now() - business.contactsVerifiedAt.getTime() < REVERIFY_COOLDOWN_MS;

    if (recentlyOk && !force) {
      const existing = await loadContacts(id);
      return NextResponse.json({
        cached: true,
        found: existing.length,
        contacts: existing,
      });
    }

    let result;
    try {
      result = await applyBusinessEnrichment(business);
    } catch (error) {
      await markBusinessEnrichError(id);
      const message =
        error instanceof Error ? error.message : "Verification lookup failed";
      return NextResponse.json({ error: message }, { status: 502 });
    }

    return NextResponse.json({
      cached: false,
      enrichment: result.enrichment,
      found: result.foundCount,
      websiteUpdated: result.websiteUpdated,
      socialsUpdated: result.socialsUpdated,
      contacts: await loadContacts(id),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "Failed to verify contacts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
