import type { SearchResult } from "@/lib/types";
import { getDb } from "./index";
import { leads, searchBusinesses, searches } from "./schema";

export async function saveSearch(
  industry: string,
  location: string,
  result: SearchResult,
): Promise<string> {
  const db = getDb();
  const [search] = await db
    .insert(searches)
    .values({
      industry,
      location,
      query: result.query,
      totalFetched: result.totalFetched,
      totalWithoutWebsite: result.totalWithoutWebsite,
      pagesFetched: result.pagesFetched,
    })
    .returning({ id: searches.id });

  if (result.allBusinesses.length === 0) {
    return search.id;
  }

  const insertedBusinesses = await db
    .insert(searchBusinesses)
    .values(
      result.allBusinesses.map((business) => ({
        searchId: search.id,
        title: business.title,
        placeId: business.placeId,
        address: business.address,
        phone: business.phone,
        website: business.website,
        hasWebsite: business.hasWebsite,
        latitude: business.latitude,
        longitude: business.longitude,
        rating: business.rating,
        reviews: business.reviews,
        type: business.type,
        mapsUrl: business.mapsUrl,
        thumbnail: business.thumbnail,
        serpPosition: business.serpPosition,
      })),
    )
    .returning({
      id: searchBusinesses.id,
      placeId: searchBusinesses.placeId,
      hasWebsite: searchBusinesses.hasWebsite,
    });

  const businessIdByPlaceId = new Map<string, string>();
  for (const row of insertedBusinesses) {
    if (row.placeId) {
      businessIdByPlaceId.set(row.placeId, row.id);
    }
  }

  const noWebsiteLeads = result.businesses;
  if (noWebsiteLeads.length > 0) {
    await db.insert(leads).values(
      noWebsiteLeads.map((business) => ({
        searchId: search.id,
        searchBusinessId: business.placeId
          ? (businessIdByPlaceId.get(business.placeId) ?? null)
          : null,
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
      })),
    );
  }

  return search.id;
}
