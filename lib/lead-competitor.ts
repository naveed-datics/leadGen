import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@/lib/db/index";
import {
  leadCompetitorPicks,
  leads,
  searchBusinesses,
} from "@/lib/db/schema";

export type TopCompetitor = {
  id: string;
  title: string;
  website: string;
};

export async function getTopCompetitorForLead(
  leadId: string,
): Promise<TopCompetitor | null> {
  const db = getDb();

  const [leadRow] = await db
    .select({
      searchId: leads.searchId,
      placeId: leads.placeId,
    })
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1);

  if (!leadRow) return null;

  const candidateConditions = [
    eq(searchBusinesses.searchId, leadRow.searchId),
    eq(searchBusinesses.hasWebsite, true),
  ];
  if (leadRow.placeId) {
    candidateConditions.push(ne(searchBusinesses.placeId, leadRow.placeId));
  }

  const candidates = await db
    .select({
      id: searchBusinesses.id,
      title: searchBusinesses.title,
      website: searchBusinesses.website,
    })
    .from(searchBusinesses)
    .where(and(...candidateConditions));

  const withWebsite = candidates.filter((c) => c.website?.trim());
  if (withWebsite.length === 0) return null;

  const [cachedPick] = await db
    .select({ competitorIds: leadCompetitorPicks.competitorIds })
    .from(leadCompetitorPicks)
    .where(eq(leadCompetitorPicks.leadId, leadId))
    .limit(1);

  if (cachedPick?.competitorIds.length) {
    const pickedId = cachedPick.competitorIds.find((id) =>
      withWebsite.some((c) => c.id === id),
    );
    const picked = pickedId
      ? withWebsite.find((c) => c.id === pickedId)
      : undefined;
    if (picked?.website) {
      return {
        id: picked.id,
        title: picked.title,
        website: picked.website,
      };
    }
  }

  const fallback = withWebsite[0];
  if (!fallback?.website) return null;

  return {
    id: fallback.id,
    title: fallback.title,
    website: fallback.website,
  };
}
