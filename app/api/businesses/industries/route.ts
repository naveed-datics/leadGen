import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/index";
import { searchBusinesses, searches } from "@/lib/db/schema";

/** Distinct industries that actually have saved businesses, for the /businesses filter. */
export async function GET() {
  try {
    const user = await requireAuth();
    const db = getDb();

    const rows = await db
      .selectDistinct({ industry: searches.industry })
      .from(searchBusinesses)
      .innerJoin(searches, eq(searchBusinesses.searchId, searches.id))
      .where(user.role === "agent" ? eq(searches.agentId, user.id) : undefined)
      .orderBy(asc(searches.industry));

    return NextResponse.json({
      industries: rows.map((row) => row.industry),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "Failed to load industries";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
