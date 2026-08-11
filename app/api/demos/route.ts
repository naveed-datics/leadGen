import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/index";
import { leads, proposals, searches } from "@/lib/db/schema";
import { DEMO_STATUS_READY } from "@/lib/demo-status";

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
        proposalBody: proposals.body,
        demoUrl: proposals.demoUrl,
        demoRequestedAt: proposals.demoRequestedAt,
        demoGenLeadId: proposals.demoGenLeadId,
        updatedAt: proposals.updatedAt,
      })
      .from(leads)
      .innerJoin(searches, eq(leads.searchId, searches.id))
      .innerJoin(proposals, eq(proposals.leadId, leads.id))
      .where(
        and(
          user.role === "agent" ? eq(searches.agentId, user.id) : undefined,
          eq(proposals.demoStatus, DEMO_STATUS_READY),
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
        hasProposal: Boolean((row.proposalBody ?? "").trim()),
        demoUrl: row.demoUrl,
        demoRequestedAt: row.demoRequestedAt?.toISOString() ?? null,
        demoGenLeadId: row.demoGenLeadId,
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
