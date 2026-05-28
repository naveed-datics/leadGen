import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/index";
import { searches } from "@/lib/db/schema";
import { AuthError, requireAuth } from "@/lib/auth/guards";

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "Database is not configured" },
      { status: 500 },
    );
  }

  try {
    const user = await requireAuth();
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
      .where(user.role === "agent" ? eq(searches.agentId, user.id) : undefined)
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
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "Failed to load searches";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
