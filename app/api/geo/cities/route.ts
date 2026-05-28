import { NextResponse } from "next/server";
import { listCitiesForCountry } from "@/lib/geo/cities";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const country = (url.searchParams.get("country") ?? "").trim();
  if (!country) {
    return NextResponse.json({ error: "country is required" }, { status: 400 });
  }

  return NextResponse.json({ country, cities: listCitiesForCountry(country) });
}

