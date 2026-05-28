import { NextResponse } from "next/server";
import { listCountries } from "@/lib/geo/cities";

export async function GET() {
  return NextResponse.json({ countries: listCountries() });
}

