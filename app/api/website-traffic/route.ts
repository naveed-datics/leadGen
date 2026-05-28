import { NextResponse } from "next/server";
import {
  extractDomain,
  isApifyConfigured,
  runApifyTrafficAnalysis,
} from "@/lib/apify-traffic";

export async function POST(req: Request) {
  try {
    if (!isApifyConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error: "APIFY_API_TOKEN is not configured in .env.local",
        },
        { status: 503 },
      );
    }

    const { url } = (await req.json()) as { url?: string };

    if (!url?.trim()) {
      return NextResponse.json(
        { success: false, error: "url is required" },
        { status: 400 },
      );
    }

    const domain = extractDomain(url.trim()) ?? url.trim();
    const data = await runApifyTrafficAnalysis(domain);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Request failed",
      },
      { status: 500 },
    );
  }
}
