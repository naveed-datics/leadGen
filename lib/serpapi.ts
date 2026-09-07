import type {
  LocalBusinessSearchPageResult,
  LocalBusinessSearchParams,
  SearchBusiness,
  SearchResult,
  SerpApiLocalResult,
  SerpApiMapsResponse,
} from "./types";

const SERPAPI_BASE = "https://serpapi.com/search.json";
const RESULTS_PER_PAGE = 20;
/** Enough offsets to chase ~300 results; Maps engine often stops earlier. */
const MAX_PAGE_START = 400;

export class SerpApiError extends Error {
  status: number;
  retryAfterSeconds: number | null;

  constructor(message: string, status: number, retryAfterSeconds: number | null = null) {
    super(message);
    this.name = "SerpApiError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function buildSearchQuery(industry: string, location: string): string {
  return `${industry} in ${location}`;
}

export function hasNoWebsite(result: SerpApiLocalResult): boolean {
  return !result.website || result.website.trim() === "";
}

function baseFields(result: SerpApiLocalResult) {
  const placeId = result.place_id ?? null;
  const lat = result.gps_coordinates?.latitude ?? null;
  const lng = result.gps_coordinates?.longitude ?? null;
  return {
    title: result.title,
    placeId,
    address: result.address ?? null,
    phone: result.phone ?? null,
    rating: result.rating ?? null,
    reviews: result.reviews ?? null,
    type: result.type ?? null,
    mapsUrl: placeId
      ? `https://www.google.com/maps/place/?q=place_id:${placeId}`
      : null,
    thumbnail: result.serpapi_thumbnail ?? result.thumbnail ?? null,
    latitude: lat,
    longitude: lng,
  };
}

function toSearchBusiness(result: SerpApiLocalResult): SearchBusiness {
  const website = result.website?.trim() || null;
  return {
    ...baseFields(result),
    website,
    hasWebsite: Boolean(website),
    serpPosition: result.position ?? null,
  };
}

async function fetchMapsPage(
  query: string,
  start: number,
  apiKey: string,
): Promise<SerpApiMapsResponse> {
  const params = new URLSearchParams({
    engine: "google_maps",
    type: "search",
    q: query,
    start: String(start),
    api_key: apiKey,
  });

  const response = await fetch(`${SERPAPI_BASE}?${params.toString()}`);

  if (!response.ok) {
    const retryAfterRaw = response.headers.get("retry-after");
    const retryAfterSeconds =
      retryAfterRaw && /^\d+$/.test(retryAfterRaw)
        ? Number.parseInt(retryAfterRaw, 10)
        : null;

    if (response.status === 429) {
      throw new SerpApiError(
        retryAfterSeconds != null
          ? `SerpApi rate limit reached. Try again in about ${retryAfterSeconds} seconds.`
          : "SerpApi rate limit reached. Try again in a few minutes.",
        429,
        retryAfterSeconds,
      );
    }

    throw new SerpApiError(
      `SerpApi request failed with status ${response.status}`,
      response.status,
      retryAfterSeconds,
    );
  }

  const data = (await response.json()) as SerpApiMapsResponse;

  if (data.error) {
    throw new Error(data.error);
  }

  return data;
}

/**
 * Search Google Maps via SerpAPI until unique results reach `targetCount`
 * or the provider returns no more pages. Each HTTP page = 1 apiHit.
 */
export async function searchLocalBusinesses(
  params: LocalBusinessSearchParams,
): Promise<LocalBusinessSearchPageResult> {
  const { industry, location, apiKey, targetCount } = params;
  const query = buildSearchQuery(industry, location);
  const seenPlaceIds = new Set<string>();
  const allResults: SerpApiLocalResult[] = [];
  let pagesFetched = 0;
  let apiHits = 0;

  for (let start = 0; start <= MAX_PAGE_START; start += RESULTS_PER_PAGE) {
    if (allResults.length >= targetCount) break;

    const data = await fetchMapsPage(query, start, apiKey);
    apiHits += 1;
    pagesFetched += 1;

    const pageResults = data.local_results ?? [];
    if (pageResults.length === 0) break;

    for (const result of pageResults) {
      if (allResults.length >= targetCount) break;
      const key = result.place_id ?? `${result.title}-${result.address ?? start}`;
      if (seenPlaceIds.has(key)) continue;
      seenPlaceIds.add(key);
      allResults.push(result);
    }

    if (pageResults.length < RESULTS_PER_PAGE) break;
  }

  return {
    query,
    pagesFetched,
    apiHits,
    allBusinesses: allResults.map(toSearchBusiness),
  };
}

/** @deprecated Prefer searchLocalBusinesses — kept for call-site compatibility during migration. */
export async function searchBusinessesWithoutWebsite(
  industry: string,
  location: string,
  apiKey: string,
  targetCount = 120,
): Promise<SearchResult> {
  const page = await searchLocalBusinesses({
    industry,
    location,
    apiKey,
    targetCount,
  });
  const withoutWebsite = page.allBusinesses.filter((b) => !b.hasWebsite);
  return {
    query: page.query,
    totalFetched: page.allBusinesses.length,
    totalWithoutWebsite: withoutWebsite.length,
    pagesFetched: page.pagesFetched,
    apiHits: page.apiHits,
    allBusinesses: page.allBusinesses,
    businesses: withoutWebsite.map((b) => ({
      title: b.title,
      placeId: b.placeId,
      address: b.address,
      phone: b.phone,
      rating: b.rating,
      reviews: b.reviews,
      type: b.type,
      mapsUrl: b.mapsUrl,
      thumbnail: b.thumbnail,
      latitude: b.latitude,
      longitude: b.longitude,
    })),
  };
}
