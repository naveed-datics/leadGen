import type {
  LocalBusinessSearchPageResult,
  LocalBusinessSearchParams,
  SearchBusiness,
} from "./types";

const PLACES_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const PAGE_SIZE = 20;
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.types",
  "places.googleMapsUri",
  "places.photos",
  "nextPageToken",
].join(",");

type PlacesTextSearchPlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  userRatingCount?: number;
  types?: string[];
  googleMapsUri?: string;
  photos?: Array<{ name?: string }>;
};

type PlacesTextSearchResponse = {
  places?: PlacesTextSearchPlace[];
  nextPageToken?: string;
  error?: { message?: string; status?: string; code?: number };
};

export class GooglePlacesError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "GooglePlacesError";
    this.status = status;
  }
}

function buildSearchQuery(industry: string, location: string): string {
  return `${industry} in ${location}`;
}

function normalizePlaceId(id: string | undefined): string | null {
  if (!id?.trim()) return null;
  return id.replace(/^places\//, "").trim() || null;
}

function toSearchBusiness(
  place: PlacesTextSearchPlace,
  position: number,
): SearchBusiness | null {
  const title = place.displayName?.text?.trim();
  if (!title) return null;

  const placeId = normalizePlaceId(place.id);
  const website = place.websiteUri?.trim() || null;
  const type = place.types?.[0] ?? null;

  return {
    title,
    placeId,
    address: place.formattedAddress?.trim() || null,
    phone: place.nationalPhoneNumber?.trim() || null,
    website,
    hasWebsite: Boolean(website),
    latitude: place.location?.latitude ?? null,
    longitude: place.location?.longitude ?? null,
    rating: place.rating ?? null,
    reviews: place.userRatingCount ?? null,
    type,
    mapsUrl:
      place.googleMapsUri?.trim() ||
      (placeId ? `https://www.google.com/maps/place/?q=place_id:${placeId}` : null),
    thumbnail: null,
    serpPosition: position,
  };
}

async function fetchTextSearchPage(
  query: string,
  apiKey: string,
  pageToken?: string,
): Promise<PlacesTextSearchResponse> {
  const body: Record<string, unknown> = {
    textQuery: query,
    pageSize: PAGE_SIZE,
  };
  if (pageToken) {
    body.pageToken = pageToken;
  }

  const response = await fetch(PLACES_TEXT_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as PlacesTextSearchResponse;

  if (!response.ok) {
    const message =
      data.error?.message ??
      `Google Places request failed with status ${response.status}`;
    if (response.status === 429) {
      throw new GooglePlacesError(
        "Google Places rate limit reached. Try again in a few minutes.",
        429,
      );
    }
    throw new GooglePlacesError(message, response.status);
  }

  if (data.error?.message) {
    throw new GooglePlacesError(data.error.message, data.error.code ?? 502);
  }

  return data;
}

/**
 * Places API (New) Text Search until unique results reach `targetCount`
 * or there is no next page. Each HTTP page = 1 apiHit.
 */
export async function searchLocalBusinesses(
  params: LocalBusinessSearchParams,
): Promise<LocalBusinessSearchPageResult> {
  const { industry, location, apiKey, targetCount } = params;
  const query = buildSearchQuery(industry, location);
  const seenPlaceIds = new Set<string>();
  const allBusinesses: SearchBusiness[] = [];
  let pagesFetched = 0;
  let apiHits = 0;
  let pageToken: string | undefined;
  const maxPages = Math.ceil(targetCount / PAGE_SIZE) + 2;

  for (let i = 0; i < maxPages; i++) {
    if (allBusinesses.length >= targetCount) break;

    const data = await fetchTextSearchPage(query, apiKey, pageToken);
    apiHits += 1;
    pagesFetched += 1;

    const places = data.places ?? [];
    if (places.length === 0) break;

    for (const place of places) {
      if (allBusinesses.length >= targetCount) break;
      const business = toSearchBusiness(place, allBusinesses.length + 1);
      if (!business) continue;
      const key =
        business.placeId ?? `${business.title}-${business.address ?? pagesFetched}`;
      if (seenPlaceIds.has(key)) continue;
      seenPlaceIds.add(key);
      allBusinesses.push(business);
    }

    const next = data.nextPageToken?.trim();
    if (!next) break;
    pageToken = next;
    // Places API requires a short delay before using nextPageToken.
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  return {
    query,
    pagesFetched,
    apiHits,
    allBusinesses,
  };
}
