import { NextResponse } from "next/server";
import { saveSearch } from "@/lib/db/save-search";
import { SerpApiError, searchBusinessesWithoutWebsite } from "@/lib/serpapi";
import type { SearchRequest } from "@/lib/types";
import { AuthError, requireActiveAgent } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/index";
import { searchActivityLogs } from "@/lib/db/schema";
import { resolveSerpApiKeyForAgent } from "@/lib/integrations/serpapi";
import { listCitiesForCountry } from "@/lib/geo/cities";

export async function POST(request: Request) {
  let body: SearchRequest;

  try {
    body = (await request.json()) as SearchRequest;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
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

  const industry = body.industry?.trim() ?? "";
  const country = agent.region ?? "";
  const city = body.city?.trim() ?? "";

  if (!industry) {
    return NextResponse.json(
      { error: "Industry is required" },
      { status: 400 },
    );
  }

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

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "Database is not configured. Add DATABASE_URL to .env.local" },
      { status: 500 },
    );
  }

  try {
    const result = await searchBusinessesWithoutWebsite(
      industry,
      `${city}, ${country}`,
      apiKey,
    );

    const db = getDb();
    await db.insert(searchActivityLogs).values({
      agentId: agent.id,
      query: result.query,
      region: `${city}, ${country}`,
    });

    const searchId = await saveSearch(agent.id, industry, `${city}, ${country}`, result);

    return NextResponse.json({ ...result, searchId });
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
