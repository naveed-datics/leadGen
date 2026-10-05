import { and, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  getLLMConfig,
  MAX_COMPETITOR_PICKS,
  pickNearestCompetitors,
  type CompetitorCandidate,
} from "@/lib/llm";
import { getDb } from "@/lib/db/index";
import {
  leadCompetitorPicks,
  leads,
  searchBusinesses,
  searches,
} from "@/lib/db/schema";
import { isApifyConfigured } from "@/lib/apify-traffic";
import { APIFY_RENT_MESSAGE, getWebsiteStatsBatch } from "@/lib/website-stats";
import type { CompetitorWithStats, CompetitorsResponse, LeadDetail } from "@/lib/types";

// Matches the website-stats cache TTL so a lead keeps the same competitors (and
// therefore the same cached stats) between proposal previews.
function normalizeCompetitorUrl(url: string): string {
  const trimmed = url.trim();
  return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
}

const PICK_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ leadId: string }> },
) {
  const { leadId } = await params;
  const searchParams = new URL(request.url).searchParams;
  const includeStats = searchParams.get("includeStats") !== "false";
  const refreshStats = searchParams.get("refreshStats") === "true";

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "Database is not configured" },
      { status: 500 },
    );
  }

  try {
    const db = getDb();

    const [row] = await db
      .select({
        lead: leads,
        searchIndustry: searches.industry,
        searchLocation: searches.location,
      })
      .from(leads)
      .innerJoin(searches, eq(leads.searchId, searches.id))
      .where(eq(leads.id, leadId))
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const { lead, searchIndustry, searchLocation } = row;

    const leadDetail: LeadDetail = {
      id: lead.id,
      title: lead.title,
      thumbnail: lead.thumbnail,
      address: lead.address,
      phone: lead.phone,
      rating: lead.rating,
      reviews: lead.reviews,
      type: lead.type,
      mapsUrl: lead.mapsUrl,
      hasWhatsapp: lead.hasWhatsapp,
    };

    const candidateConditions = [
      eq(searchBusinesses.searchId, lead.searchId),
      eq(searchBusinesses.hasWebsite, true),
    ];
    if (lead.placeId) {
      candidateConditions.push(ne(searchBusinesses.placeId, lead.placeId));
    }

    const candidates = await db
      .select()
      .from(searchBusinesses)
      .where(and(...candidateConditions));

    if (candidates.length === 0) {
      const hasAnyBusinesses = await db
        .select({ id: searchBusinesses.id })
        .from(searchBusinesses)
        .where(eq(searchBusinesses.searchId, lead.searchId))
        .limit(1);

      const response: CompetitorsResponse = {
        lead: leadDetail,
        competitors: [],
        pickSource: "none",
        competitorsMessage: hasAnyBusinesses.length
          ? "No competitors with a website found in this scan."
          : "Re-run this search to load full business data for competitor analysis.",
      };
      return NextResponse.json(response);
    }

    let pickSource: CompetitorsResponse["pickSource"] = "ai";
    let competitorIds: string[] = [];

    const [cachedPick] = await db
      .select()
      .from(leadCompetitorPicks)
      .where(eq(leadCompetitorPicks.leadId, leadId))
      .limit(1);

    const cacheFresh =
      cachedPick &&
      Date.now() - cachedPick.pickedAt.getTime() < PICK_CACHE_TTL_MS;

    const validCandidateIds = new Set(candidates.map((c) => c.id));

    if (cacheFresh) {
      competitorIds = cachedPick.competitorIds
        .filter((id) => validCandidateIds.has(id))
        .slice(0, MAX_COMPETITOR_PICKS);
      pickSource = "cache";
    }

    if (competitorIds.length === 0) {
      const llmConfig = getLLMConfig();
      if (!llmConfig) {
        return NextResponse.json(
          {
            error:
              "LLM is not configured. Add LLM_API_KEY to .env.local",
          },
          { status: 503 },
        );
      }

      const aiCandidates: CompetitorCandidate[] = candidates
        .filter((c) => c.website)
        .map((c) => ({
          id: c.id,
          title: c.title,
          address: c.address,
          website: c.website!,
          latitude: c.latitude,
          longitude: c.longitude,
          type: c.type,
          rating: c.rating,
        }));

      competitorIds = await pickNearestCompetitors(
        {
          title: lead.title,
          address: lead.address,
          latitude: lead.latitude,
          longitude: lead.longitude,
          type: lead.type,
          searchLocation,
          searchIndustry,
        },
        aiCandidates,
        llmConfig,
      );
      pickSource = "ai";

      await db
        .insert(leadCompetitorPicks)
        .values({ leadId, competitorIds })
        .onConflictDoUpdate({
          target: leadCompetitorPicks.leadId,
          set: { competitorIds, pickedAt: new Date() },
        });
    }

    const pickedRows = competitorIds
      .map((id) => candidates.find((c) => c.id === id))
      .filter((c): c is (typeof candidates)[number] => Boolean(c));

    // One batched lookup for every picked competitor: cached sites are free and
    // the rest share a single Apify run. Results persist in the stats cache.
    const statsByUrl = includeStats
      ? await getWebsiteStatsBatch(
          pickedRows.map((competitor) => competitor.website!),
          { bypassCache: refreshStats },
        )
      : null;

    const competitorsWithStats: CompetitorWithStats[] = pickedRows.map(
      (competitor) => ({
        id: competitor.id,
        title: competitor.title,
        website: competitor.website!,
        address: competitor.address,
        stats: (statsByUrl?.get(normalizeCompetitorUrl(competitor.website!)) ?? {
          trafficLabel: null,
          trafficEstimate: null,
          websiteAge: null,
          lastUpdated: null,
          source: "measured" as const,
        }),
      }),
    );

    const usingAiTraffic =
      isApifyConfigured() &&
      competitorsWithStats.length > 0 &&
      competitorsWithStats.every((c) => c.stats.source !== "apify");

    const response: CompetitorsResponse = {
      lead: leadDetail,
      competitors: competitorsWithStats,
      pickSource,
      trafficNote: usingAiTraffic ? APIFY_RENT_MESSAGE : undefined,
    };

    return NextResponse.json(response);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load competitors";
    console.error(`[competitors] Failed for lead ${leadId}: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
