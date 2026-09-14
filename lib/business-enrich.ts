import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/index";
import { businessContacts, leads, searchBusinesses } from "@/lib/db/schema";
import {
  enrichBusiness,
  hasUsableEnrichUrl,
  parseUsAddress,
  type EnrichResponse,
} from "@/lib/integrations/find-facebook-page";
import { mergeSocials, normalizeSocialUrl } from "@/lib/social-urls";

export type EnrichableBusiness = {
  id: string;
  searchId: string;
  title: string;
  address: string | null;
  placeId: string | null;
  phone: string | null;
  rating: number | null;
  reviews: number | null;
  type: string | null;
  mapsUrl: string | null;
  thumbnail: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type ApplyEnrichResult = {
  facebookUrl: string | null;
  instagramUrl: string | null;
  websiteUrl: string | null;
  foundCount: number;
  socialsUpdated: boolean;
  websiteUpdated: boolean;
  matchConfidence: string;
  enrichment: EnrichResponse;
};

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

/**
 * Call find-facebook-page enrich and persist contacts + socials + website.
 * Shared by single verify-contacts and the no-website batch job.
 */
export async function applyBusinessEnrichment(
  business: EnrichableBusiness,
): Promise<ApplyEnrichResult> {
  const db = getDb();
  const parsedAddress = parseUsAddress(business.address);

  const enrichment = await enrichBusiness({
    business_name: business.title,
    phone: business.phone,
    address: parsedAddress.address,
    city: parsedAddress.city,
    state: parsedAddress.state,
    zip_code: parsedAddress.zip_code,
  });

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
    .where(eq(businessContacts.searchBusinessId, business.id));

  await db.insert(businessContacts).values({
    searchBusinessId: business.id,
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
    .where(eq(searchBusinesses.id, business.id));

  const socialUrls = [facebookUrl, instagramUrl].filter(
    (url): url is string => Boolean(url),
  );

  let socialsUpdated = false;
  if (socialUrls.length > 0) {
    const [existingLead] = await db
      .select({ id: leads.id, socials: leads.socials })
      .from(leads)
      .where(eq(leads.searchBusinessId, business.id))
      .limit(1);

    if (existingLead) {
      await db
        .update(leads)
        .set({ socials: mergeSocials(existingLead.socials, socialUrls) })
        .where(eq(leads.id, existingLead.id));
    } else {
      await db.insert(leads).values({
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
        socials: mergeSocials(null, socialUrls),
      });
    }
    socialsUpdated = true;
  }

  return {
    facebookUrl,
    instagramUrl,
    websiteUrl,
    foundCount,
    socialsUpdated,
    websiteUpdated: Boolean(websiteUrl),
    matchConfidence,
    enrichment,
  };
}

export async function markBusinessEnrichError(businessId: string): Promise<void> {
  const db = getDb();
  await db
    .update(searchBusinesses)
    .set({ contactsStatus: "error", contactsVerifiedAt: new Date() })
    .where(eq(searchBusinesses.id, businessId));
}
