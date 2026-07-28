import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/index";
import { leads, proposals, searches, users } from "@/lib/db/schema";
import {
  PROPOSAL_STATUS_IN_PROGRESS,
  PROPOSAL_STATUS_REPLIED,
  PROPOSAL_STATUS_SENT,
} from "@/lib/proposal-status";

const STATUS_FILTERS = {
  [PROPOSAL_STATUS_IN_PROGRESS]: [PROPOSAL_STATUS_IN_PROGRESS, "draft"],
  [PROPOSAL_STATUS_SENT]: [PROPOSAL_STATUS_SENT],
  [PROPOSAL_STATUS_REPLIED]: [PROPOSAL_STATUS_REPLIED],
} as const;

type StatusFilter = keyof typeof STATUS_FILTERS;

function isStatusFilter(value: string | null): value is StatusFilter {
  return value !== null && value in STATUS_FILTERS;
}

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "Database is not configured" },
      { status: 500 },
    );
  }

  const status = new URL(request.url).searchParams.get("status");
  if (!isStatusFilter(status)) {
    return NextResponse.json(
      { error: "Invalid or missing status filter" },
      { status: 400 },
    );
  }

  try {
    const user = await requireAuth();
    const db = getDb();

    const rows = await db
      .select({
        id: proposals.id,
        leadId: proposals.leadId,
        status: proposals.status,
        demoUrl: proposals.demoUrl,
        demoStatus: proposals.demoStatus,
        sentAt: proposals.sentAt,
        repliedAt: proposals.repliedAt,
        createdAt: proposals.createdAt,
        updatedAt: proposals.updatedAt,
        leadTitle: leads.title,
        leadPhone: leads.phone,
        searchId: leads.searchId,
        agentName: users.name,
      })
      .from(proposals)
      .innerJoin(leads, eq(proposals.leadId, leads.id))
      .innerJoin(searches, eq(leads.searchId, searches.id))
      .innerJoin(users, eq(searches.agentId, users.id))
      .where(
        and(
          inArray(proposals.status, [...STATUS_FILTERS[status]]),
          user.role === "agent" ? eq(searches.agentId, user.id) : undefined,
        ),
      )
      .orderBy(desc(proposals.updatedAt))
      .limit(500);

    return NextResponse.json({
      proposals: rows.map((row) => ({
        id: row.id,
        leadId: row.leadId,
        status: row.status,
        demoUrl: row.demoUrl,
        demoStatus: row.demoStatus,
        sentAt: row.sentAt?.toISOString() ?? null,
        repliedAt: row.repliedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        leadTitle: row.leadTitle,
        leadPhone: row.leadPhone,
        searchId: row.searchId,
        agentName: user.role === "admin" ? row.agentName : null,
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    const message =
      error instanceof Error ? error.message : "Failed to load proposals";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
