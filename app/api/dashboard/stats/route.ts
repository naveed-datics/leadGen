import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/index";
import { leads, proposals, searches } from "@/lib/db/schema";

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

    const searchScope =
      user.role === "agent" ? eq(searches.agentId, user.id) : undefined;

    const [row] = await db
      .select({
        totalLeads: sql<number>`count(${leads.id})`,
        proposalsInProgress: sql<number>`sum(case when ${proposals.status} in ('in_progress', 'draft') then 1 else 0 end)`,
        proposalsSent: sql<number>`sum(case when ${proposals.status} = 'sent' then 1 else 0 end)`,
        proposalsReplied: sql<number>`sum(case when ${proposals.status} = 'replied' then 1 else 0 end)`,
      })
      .from(leads)
      .innerJoin(searches, eq(leads.searchId, searches.id))
      .leftJoin(proposals, eq(proposals.leadId, leads.id))
      .where(searchScope)
      .limit(1);

    return NextResponse.json({
      stats: {
        totalLeads: Number(row?.totalLeads ?? 0),
        proposalsInProgress: Number(row?.proposalsInProgress ?? 0),
        proposalsSent: Number(row?.proposalsSent ?? 0),
        proposalsReplied: Number(row?.proposalsReplied ?? 0),
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    const message =
      error instanceof Error ? error.message : "Failed to load dashboard stats";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

