/**
 * Google Maps Places Crawler (Apify actor compass/crawler-google-places).
 *
 * Given a business name as a search string, returns place details: address,
 * phone, website, category, rating, reviews count, opening hours. Searched
 * live at run time — no shared database, no login.
 */

const DEFAULT_ACTOR_ID = "compass~crawler-google-places";
const SYNC_TIMEOUT_SEC = 280;

export interface GooglePlaceResult {
  title: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  placeId: string | null;
  category: string | null;
  rating: number | null;
  reviewsCount: number | null;
  openingHours: unknown;
  /** The complete unmodified actor record. */
  raw: Record<string, unknown>;
}

export interface FindPlaceDetailsOptions {
  /** Plain business name, used as the search string. */
  businessName: string;
  /** Hard ceiling on Apify spend for this run, in USD. */
  maxTotalChargeUsd?: number;
}

export function isGooglePlacesCrawlerConfigured(): boolean {
  return Boolean(process.env.APIFY_API_TOKEN?.trim());
}

function getActorId(): string {
  return process.env.APIFY_GOOGLE_PLACES_ACTOR_ID?.trim() || DEFAULT_ACTOR_ID;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function mapPlace(raw: Record<string, unknown>): GooglePlaceResult {
  return {
    title: str(raw.title),
    address: str(raw.address),
    phone: str(raw.phone ?? raw.phoneUnformatted),
    website: str(raw.website),
    placeId: str(raw.placeId),
    category: str(raw.categoryName),
    rating: num(raw.totalScore),
    reviewsCount: num(raw.reviewsCount),
    openingHours: raw.openingHours ?? null,
    raw,
  };
}

export async function findPlaceDetails(
  options: FindPlaceDetailsOptions,
): Promise<GooglePlaceResult | null> {
  const token = process.env.APIFY_API_TOKEN?.trim();
  if (!token) {
    throw new Error("APIFY_API_TOKEN is not configured");
  }

  const endpoint = new URL(
    `https://api.apify.com/v2/acts/${getActorId()}/run-sync-get-dataset-items`,
  );
  endpoint.searchParams.set("token", token);
  endpoint.searchParams.set("timeout", String(SYNC_TIMEOUT_SEC));
  if (options.maxTotalChargeUsd != null) {
    endpoint.searchParams.set(
      "maxTotalChargeUsd",
      String(options.maxTotalChargeUsd),
    );
  }

  const body = {
    searchStringsArray: [options.businessName],
    maxCrawledPlacesPerSearch: 1,
  };

  const response = await fetch(endpoint.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout((SYNC_TIMEOUT_SEC + 15) * 1000),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Google Places Crawler failed (${response.status}): ${text.slice(0, 300)}`,
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `Google Places Crawler returned a non-JSON response: ${text.slice(0, 200)}`,
    );
  }

  if (!Array.isArray(data) || data.length === 0) return null;

  const first = data[0];
  if (!first || typeof first !== "object") return null;

  return mapPlace(first as Record<string, unknown>);
}
