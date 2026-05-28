import { NextResponse } from "next/server";
import { saveSearch } from "@/lib/db/save-search";
import { searchBusinessesWithoutWebsite } from "@/lib/serpapi";
import type { SearchRequest } from "@/lib/types";

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

  const industry = body.industry?.trim() ?? "";
  const location = body.location?.trim() ?? "";

  if (!industry) {
    return NextResponse.json(
      { error: "Industry is required" },
      { status: 400 },
    );
  }

  if (!location) {
    return NextResponse.json(
      { error: "Location is required" },
      { status: 400 },
    );
  }

  const apiKey = process.env.SERPAPI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "SerpApi is not configured. Add SERPAPI_API_KEY to .env.local" },
      { status: 500 },
    );
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
      location,
      apiKey,
    );

    const searchId = await saveSearch(industry, location, result);

    return NextResponse.json({ ...result, searchId });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Search failed unexpectedly";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
