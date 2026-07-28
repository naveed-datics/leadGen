import type {
  BusinessLead,
  SearchBusiness,
  SearchResult,
  SerpApiLocalResult,
  SerpApiMapsResponse,
} from "./types";

const SERPAPI_BASE = "https://serpapi.com/search.json";
const PAGE_OFFSETS = [0, 20, 40, 60, 80, 100] as const;
const RESULTS_PER_PAGE = 20;

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

function toBusinessLead(result: SerpApiLocalResult): BusinessLead {
  return baseFields(result);
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

export async function searchBusinessesWithoutWebsite(
  industry: string,
  location: string,
  apiKey: string,
): Promise<SearchResult> {
  const query = buildSearchQuery(industry, location);
  const seenPlaceIds = new Set<string>();
  const allResults: SerpApiLocalResult[] = [];
  let pagesFetched = 0;

  for (const start of PAGE_OFFSETS) {
    const data = await fetchMapsPage(query, start, apiKey);
    const pageResults = data.local_results ?? [];
    pagesFetched += 1;

    if (pageResults.length === 0) {
      break;
    }

    for (const result of pageResults) {
      const key = result.place_id ?? `${result.title}-${result.address ?? start}`;
      if (seenPlaceIds.has(key)) continue;
      seenPlaceIds.add(key);
      allResults.push(result);
    }

    if (pageResults.length < RESULTS_PER_PAGE) {
      break;
    }
  }

  const allBusinesses = allResults.map(toSearchBusiness);
  const withoutWebsite = allResults.filter(hasNoWebsite);

  return {
    query,
    totalFetched: allResults.length,
    totalWithoutWebsite: withoutWebsite.length,
    pagesFetched,
    allBusinesses,
    businesses: withoutWebsite.map(toBusinessLead),
  };
}
