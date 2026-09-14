import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireAuth } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/index";
import { businessContacts, leads, searchBusinesses, searches } from "@/lib/db/schema";
import {
  enrichBusiness,
  hasUsableEnrichUrl,
  parseUsAddress,
} from "@/lib/integrations/find-facebook-page";
import { mergeSocials, normalizeSocialUrl } from "@/lib/social-urls";

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

function pickOverallConfidence(
  facebookConfidence: string,
  instagramConfidence: string,
  websiteConfidence: string,
): string {
  const rank: Record<string, number> = {
    high: 4,
    medium: 3,
    low: 2,
    none: 1,
  };
  const best = [facebookConfidence, instagramConfidence, websiteConfidence].sort(
    (a, b) => (rank[b] ?? 0) - (rank[a] ?? 0),
  )[0];
  return best ?? "none";
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

    const parsedAddress = parseUsAddress(business.address);

    let enrichment;
    try {
      enrichment = await enrichBusiness({
        business_name: business.title,
        phone: business.phone,
        address: parsedAddress.address,
        city: parsedAddress.city,
        state: parsedAddress.state,
        zip_code: parsedAddress.zip_code,
      });
    } catch (error) {
      await db
        .update(searchBusinesses)
        .set({ contactsStatus: "error", contactsVerifiedAt: new Date() })
        .where(eq(searchBusinesses.id, id));
      const message =
        error instanceof Error ? error.message : "Verification lookup failed";
      return NextResponse.json({ error: message }, { status: 502 });
    }

    const facebookUrl = hasUsableEnrichUrl(enrichment.facebook)
      ? normalizeSocialUrl(enrichment.facebook.url!)
      : null;
    const instagramUrl = hasUsableEnrichUrl(enrichment.instagram)
      ? normalizeSocialUrl(enrichment.instagram.url!)
      : null;
    const websiteUrl = hasUsableEnrichUrl(enrichment.website)
      ? enrichment.website.url!.trim()
      : null;

    const matchConfidence = pickOverallConfidence(
      facebookUrl ? enrichment.facebook.match_confidence : "none",
      instagramUrl ? enrichment.instagram.match_confidence : "none",
      websiteUrl ? enrichment.website.match_confidence : "none",
    );

    const matchNotes = [
      enrichment.notes,
      enrichment.facebook.reasoning
        ? `Facebook: ${enrichment.facebook.reasoning}`
        : null,
      enrichment.instagram.reasoning
        ? `Instagram: ${enrichment.instagram.reasoning}`
        : null,
      enrichment.website.reasoning
        ? `Website: ${enrichment.website.reasoning}`
        : null,
    ]
      .filter(Boolean)
      .join(" | ");

    const foundCount =
      (facebookUrl ? 1 : 0) + (instagramUrl ? 1 : 0) + (websiteUrl ? 1 : 0);

    const verifiedAt = new Date();

    await db
      .delete(businessContacts)
      .where(eq(businessContacts.searchBusinessId, id));

    await db.insert(businessContacts).values({
      searchBusinessId: id,
      name: business.title,
      source: "find-facebook-page",
      facebookUrl,
      instagramUrl,
      reviewsJson: [],
      photoUrls: [],
      matchConfidence,
      matchNotes: matchNotes || null,
      tavilyRawJson: enrichment,
    });

    const businessPatch: {
      contactsVerifiedAt: Date;
      contactsFound: number;
      contactsStatus: string;
      website?: string;
      hasWebsite?: boolean;
    } = {
      contactsVerifiedAt: verifiedAt,
      contactsFound: foundCount,
      contactsStatus: foundCount > 0 ? "ok" : "none",
    };

    if (websiteUrl) {
      businessPatch.website = websiteUrl;
      businessPatch.hasWebsite = true;
    }

    await db
      .update(searchBusinesses)
      .set(businessPatch)
      .where(eq(searchBusinesses.id, id));

    const socialUrls = [facebookUrl, instagramUrl].filter(
      (url): url is string => Boolean(url),
    );

    if (socialUrls.length > 0) {
      const [existingLead] = await db
        .select({ id: leads.id, socials: leads.socials })
        .from(leads)
        .where(eq(leads.searchBusinessId, id))
        .limit(1);

      if (existingLead) {
        await db
          .update(leads)
          .set({ socials: mergeSocials(existingLead.socials, socialUrls) })
          .where(eq(leads.id, existingLead.id));
      } else {
        await db.insert(leads).values({
          searchId: business.searchId,
          searchBusinessId: id,
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
          socials: mergeSocials(null, socialUrls),
        });
      }
    }

    return NextResponse.json({
      cached: false,
      enrichment,
      found: foundCount,
      websiteUpdated: Boolean(websiteUrl),
      socialsUpdated: socialUrls.length > 0,
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
