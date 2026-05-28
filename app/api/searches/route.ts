import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/index";
import { searches } from "@/lib/db/schema";

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "Database is not configured" },
      { status: 500 },
    );
  }

  try {
    const db = getDb();
    const rows = await db
      .select({
        id: searches.id,
        query: searches.query,
        industry: searches.industry,
        location: searches.location,
        totalWithoutWebsite: searches.totalWithoutWebsite,
        createdAt: searches.createdAt,
      })
      .from(searches)
      .orderBy(desc(searches.createdAt));

    return NextResponse.json({
      searches: rows.map((row) => ({
        id: row.id,
        query: row.query,
        industry: row.industry,
        location: row.location,
        totalWithoutWebsite: row.totalWithoutWebsite,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load searches";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
