import { and, desc, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/index";
import { leads, proposals, searches } from "@/lib/db/schema";
import { DEMO_STATUS_NONE, type DemoStatus } from "@/lib/demo-status";

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
        leadId: leads.id,
        title: leads.title,
        mapsUrl: leads.mapsUrl,
        searchId: leads.searchId,
        proposalId: proposals.id,
        proposalStatus: proposals.status,
        demoUrl: proposals.demoUrl,
        demoStatus: proposals.demoStatus,
        demoRequestedAt: proposals.demoRequestedAt,
        updatedAt: proposals.updatedAt,
      })
      .from(leads)
      .innerJoin(searches, eq(leads.searchId, searches.id))
      .innerJoin(proposals, eq(proposals.leadId, leads.id))
      .where(
        and(
          user.role === "agent" ? eq(searches.agentId, user.id) : undefined,
          ne(proposals.demoStatus, DEMO_STATUS_NONE),
        ),
      )
      .orderBy(desc(proposals.updatedAt));

    return NextResponse.json({
      demos: rows.map((row) => ({
        leadId: row.leadId,
        title: row.title,
        mapsUrl: row.mapsUrl,
        searchId: row.searchId,
        proposalId: row.proposalId,
        proposalStatus: row.proposalStatus,
        demoUrl: row.demoUrl,
        demoStatus: row.demoStatus as DemoStatus,
        demoRequestedAt: row.demoRequestedAt?.toISOString() ?? null,
        updatedAt: row.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "Failed to load demos";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
