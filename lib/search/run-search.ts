import { and, eq } from "drizzle-orm";
import { isUniqueViolation } from "@/lib/db/industry-helpers";
import { getDb } from "@/lib/db/index";
import { saveSearch } from "@/lib/db/save-search";
import { searchActivityLogs, searches } from "@/lib/db/schema";
import { listSearchableCitiesForCountry } from "@/lib/geo/cities";
import { resolveSearchPlan } from "@/lib/geo/resolve-location";
import { searchLocalBusinesses as searchGooglePlaces } from "@/lib/google-places";
import { buildSearchKey } from "@/lib/industries";
import { BULK_TIMEBOX_MS, PER_CITY_TARGET } from "@/lib/search/constants";
import { searchLocalBusinesses as searchSerpApi } from "@/lib/serpapi";
import type {
  BulkCityCreated,
  BulkCityFailed,
  BulkCitySkipped,
  BulkSearchResponse,
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

export type RunBulkCountrySearchParams = {
  agentId: string;
  source: SearchDataSource;
  industry: string;
  country: string;
  apiKey: string;
  resumeAfter?: string;
  timeboxMs?: number;
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

function locationQueryForCountry(city: string, country: string): string {
  return country && !city.toLowerCase().includes(country.toLowerCase())
    ? `${city}, ${country}`
    : city;
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

function pageToSearchResult(
  page: LocalBusinessSearchPageResult,
  source: SearchDataSource,
): SearchResult {
  const withoutWebsite = page.allBusinesses.filter((b) => !b.hasWebsite);
  return {
    query: page.query,
    totalFetched: page.allBusinesses.length,
    totalWithoutWebsite: withoutWebsite.length,
    pagesFetched: page.pagesFetched,
    apiHits: page.apiHits,
    dataSource: source,
    allBusinesses: page.allBusinesses,
    businesses: withoutWebsite.map(toBusinessLead),
  };
}

/**
 * Runs city or state search at 300 results per city against the configured provider.
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
    const locationQuery = locationQueryForCountry(city, country);

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

/**
 * Country-wide bulk: 300 results per city, one saved search per city.
 * Skips cities that already have a search key. Time-boxes so the client can resume.
 */
export async function runBulkCountrySearch(
  params: RunBulkCountrySearchParams,
): Promise<BulkSearchResponse> {
  const {
    agentId,
    source,
    industry,
    country,
    apiKey,
    resumeAfter,
    timeboxMs = BULK_TIMEBOX_MS,
  } = params;

  const cities = listSearchableCitiesForCountry(country);
  const created: BulkCityCreated[] = [];
  const skipped: BulkCitySkipped[] = [];
  const failed: BulkCityFailed[] = [];

  const empty: BulkSearchResponse = {
    mode: "bulk",
    complete: true,
    country,
    industry,
    perCityTarget: PER_CITY_TARGET,
    totalCities: cities.length,
    created,
    skipped,
    failed,
  };

  if (cities.length === 0) {
    return empty;
  }

  const resumeIndex = resumeAfter ? cities.indexOf(resumeAfter) : -1;
  const startIndex = resumeIndex >= 0 ? resumeIndex + 1 : 0;
  if (startIndex >= cities.length) {
    return empty;
  }

  const db = getDb();
  const existingRows = await db
    .select({ id: searches.id, searchKey: searches.searchKey })
    .from(searches)
    .where(eq(searches.agentId, agentId));
  const existingByKey = new Map<string, string>();
  for (const row of existingRows) {
    if (row.searchKey) {
      existingByKey.set(row.searchKey, row.id);
    }
  }

  const startedAt = Date.now();
  let lastFinished: string | undefined;

  for (let index = startIndex; index < cities.length; index += 1) {
    const city = cities[index];
    if (!city) continue;
    const searchKey = buildSearchKey(industry, city);
    const existingId = existingByKey.get(searchKey);

    if (existingId) {
      skipped.push({ city, existingSearchId: existingId });
    } else {
      try {
        const locationQuery = locationQueryForCountry(city, country);
        console.info(
          `[search] ${source} bulk city="${locationQuery}" target=${PER_CITY_TARGET}`,
        );

        const page = await searchOneLocation(
          source,
          industry,
          locationQuery,
          apiKey,
          PER_CITY_TARGET,
        );
        const result = pageToSearchResult(page, source);
        const searchId = await saveSearch(agentId, industry, city, result, searchKey, {
          dataSource: source,
          apiHits: result.apiHits,
        });

        existingByKey.set(searchKey, searchId);
        created.push({
          searchId,
          city,
          totalFetched: result.totalFetched,
          totalWithoutWebsite: result.totalWithoutWebsite,
          apiHits: result.apiHits,
        });

        await db.insert(searchActivityLogs).values({
          agentId,
          query: result.query,
          region: `${city}, ${country}`,
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          const [raceExisting] = await db
            .select({ id: searches.id })
            .from(searches)
            .where(
              and(eq(searches.agentId, agentId), eq(searches.searchKey, searchKey)),
            )
            .limit(1);
          const raceId = raceExisting?.id;
          if (raceId) {
            existingByKey.set(searchKey, raceId);
            skipped.push({ city, existingSearchId: raceId });
          } else {
            failed.push({
              city,
              error: "Duplicate search key, but the existing search was not found.",
            });
          }
        } else {
          const message =
            error instanceof Error ? error.message : "Search failed unexpectedly";
          failed.push({ city, error: message });
        }
      }
    }

    lastFinished = city;
    const isLast = index === cities.length - 1;
    if (!isLast && Date.now() - startedAt >= timeboxMs) {
      return {
        mode: "bulk",
        complete: false,
        resumeAfter: lastFinished,
        country,
        industry,
        perCityTarget: PER_CITY_TARGET,
        totalCities: cities.length,
        created,
        skipped,
        failed,
      };
    }
  }

  return {
    mode: "bulk",
    complete: true,
    country,
    industry,
    perCityTarget: PER_CITY_TARGET,
    totalCities: cities.length,
    created,
    skipped,
    failed,
  };
}
