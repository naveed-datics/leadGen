import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireActiveAgent } from "@/lib/auth/guards";
import { isUniqueViolation } from "@/lib/db/industry-helpers";
import { saveSearch } from "@/lib/db/save-search";
import { getDb } from "@/lib/db/index";
import { industries, searchActivityLogs, searches } from "@/lib/db/schema";
import { listCitiesForCountry } from "@/lib/geo/cities";
import { buildSearchKey } from "@/lib/industries";
import { resolveSerpApiKeyForAgent } from "@/lib/integrations/serpapi";
import { SerpApiError, searchBusinessesWithoutWebsite } from "@/lib/serpapi";

const SearchBodySchema = z.object({
  industryId: z.string().uuid(),
  city: z.string().min(1),
});

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "Database is not configured. Add DATABASE_URL to .env.local" },
      { status: 500 },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = SearchBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Industry and city are required" },
      { status: 400 },
    );
  }

  let agent;
  try {
    agent = await requireActiveAgent();
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 401 });
  }

  if (!agent.searchEnabled) {
    return NextResponse.json(
      { error: "Search disabled by admin" },
      { status: 403 },
    );
  }

  const city = parsed.data.city.trim();
  const country = agent.region ?? "";

  if (!city) {
    return NextResponse.json({ error: "City is required" }, { status: 400 });
  }

  const allowedCities = listCitiesForCountry(country);
  if (allowedCities.length > 0 && !allowedCities.includes(city)) {
    return NextResponse.json(
      { error: `City must be within assigned country (${country})` },
      { status: 403 },
    );
  }

  const db = getDb();
  const [industry] = await db
    .select({
      id: industries.id,
      name: industries.name,
    })
    .from(industries)
    .where(
      and(
        eq(industries.id, parsed.data.industryId),
        eq(industries.agentId, agent.id),
      ),
    )
    .limit(1);

  if (!industry) {
    return NextResponse.json(
      { error: "Select an industry from your Industries list." },
      { status: 400 },
    );
  }

  const searchKey = buildSearchKey(industry.name, city);
  const [existing] = await db
    .select({ id: searches.id })
    .from(searches)
    .where(and(eq(searches.agentId, agent.id), eq(searches.searchKey, searchKey)))
    .limit(1);

  if (existing) {
    return NextResponse.json(
      {
        error: `You already searched “${industry.name}” in ${city}. Open the existing saved search instead.`,
        existingSearchId: existing.id,
      },
      { status: 409 },
    );
  }

  let apiKey: string;
  try {
    apiKey = await resolveSerpApiKeyForAgent(agent.id);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "SerpApi key is not configured. Add it in Settings.";
    return NextResponse.json({ error: message }, { status: 403 });
  }

  try {
    const result = await searchBusinessesWithoutWebsite(
      industry.name,
      `${city}, ${country}`,
      apiKey,
    );

    try {
      const searchId = await saveSearch(
        agent.id,
        industry.name,
        `${city}, ${country}`,
        result,
        searchKey,
      );

      await db.insert(searchActivityLogs).values({
        agentId: agent.id,
        query: result.query,
        region: `${city}, ${country}`,
      });

      return NextResponse.json({ ...result, searchId });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const [raceExisting] = await db
          .select({ id: searches.id })
          .from(searches)
          .where(
            and(eq(searches.agentId, agent.id), eq(searches.searchKey, searchKey)),
          )
          .limit(1);
        return NextResponse.json(
          {
            error: `You already searched “${industry.name}” in ${city}. Open the existing saved search instead.`,
            existingSearchId: raceExisting?.id ?? null,
          },
          { status: 409 },
        );
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof SerpApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status === 429 ? 429 : 502 },
      );
    }
    const message =
      error instanceof Error ? error.message : "Search failed unexpectedly";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
