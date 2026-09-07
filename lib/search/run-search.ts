import { searchLocalBusinesses as searchGooglePlaces } from "@/lib/google-places";
import { resolveSearchPlan } from "@/lib/geo/resolve-location";
import { searchLocalBusinesses as searchSerpApi } from "@/lib/serpapi";
import type {
  BusinessLead,
  LocalBusinessSearchPageResult,
  SearchBusiness,
  SearchDataSource,
  SearchResult,
} from "@/lib/types";

export type RunBusinessSearchParams = {
  source: SearchDataSource;
  industry: string;
  /** User-selected location value (state name or city). */
  locationSelection: string;
  /** Agent region / country, used for state expansion. */
  country: string;
  apiKey: string;
};

function toBusinessLead(business: SearchBusiness): BusinessLead {
  return {
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
  };
}

async function searchOneLocation(
  source: SearchDataSource,
  industry: string,
  location: string,
  apiKey: string,
  targetCount: number,
): Promise<LocalBusinessSearchPageResult> {
  if (source === "google_places") {
    return searchGooglePlaces({ industry, location, apiKey, targetCount });
  }
  return searchSerpApi({ industry, location, apiKey, targetCount });
}

/**
 * Runs city (300) or state (150 × each city) search against the configured provider.
 * Dedupes by placeId across cities and sums apiHits.
 */
export async function runBusinessSearch(
  params: RunBusinessSearchParams,
): Promise<SearchResult> {
  const { source, industry, locationSelection, country, apiKey } = params;
  const plan = resolveSearchPlan(locationSelection, country);

  const seenPlaceIds = new Set<string>();
  const allBusinesses: SearchBusiness[] = [];
  let apiHits = 0;
  let pagesFetched = 0;
  const cityQueries: string[] = [];

  for (const city of plan.cities) {
    const locationQuery =
      country && !city.toLowerCase().includes(country.toLowerCase())
        ? `${city}, ${country}`
        : city;

    console.info(
      `[search] ${source} ${plan.mode} city="${locationQuery}" target=${plan.perCityTarget}`,
    );

    const page = await searchOneLocation(
      source,
      industry,
      locationQuery,
      apiKey,
      plan.perCityTarget,
    );

    apiHits += page.apiHits;
    pagesFetched += page.pagesFetched;
    cityQueries.push(page.query);

    for (const business of page.allBusinesses) {
      const key =
        business.placeId ??
        `${business.title}-${business.address ?? ""}`.toLowerCase();
      if (seenPlaceIds.has(key)) continue;
      seenPlaceIds.add(key);
      allBusinesses.push({
        ...business,
        serpPosition: allBusinesses.length + 1,
      });
    }
  }

  const withoutWebsite = allBusinesses.filter((b) => !b.hasWebsite);
  const query =
    plan.mode === "state"
      ? `${industry} in ${plan.selection} (${plan.cities.length} cities)`
      : (cityQueries[0] ?? `${industry} in ${plan.selection}`);

  return {
    query,
    totalFetched: allBusinesses.length,
    totalWithoutWebsite: withoutWebsite.length,
    pagesFetched,
    apiHits,
    dataSource: source,
    allBusinesses,
    businesses: withoutWebsite.map(toBusinessLead),
  };
}
