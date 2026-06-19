import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/index";
import { leads, proposals, searches } from "@/lib/db/schema";
import { AuthError, requireAuth } from "@/lib/auth/guards";
import type { ProposalStatus } from "@/lib/proposal-status";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "Database is not configured" },
      { status: 500 },
    );
  }

  try {
    const user = await requireAuth();
    const db = getDb();

    const [search] = await db
      .select()
      .from(searches)
      .where(
        and(
          eq(searches.id, id),
          user.role === "agent" ? eq(searches.agentId, user.id) : undefined,
        ),
      )
      .limit(1);

    if (!search) {
      return NextResponse.json({ error: "Search not found" }, { status: 404 });
    }

    const leadRows = await db
      .select({
        id: leads.id,
        title: leads.title,
        placeId: leads.placeId,
        address: leads.address,
        phone: leads.phone,
        rating: leads.rating,
        reviews: leads.reviews,
        type: leads.type,
        mapsUrl: leads.mapsUrl,
        thumbnail: leads.thumbnail,
        hasWhatsapp: leads.hasWhatsapp,
        proposalId: proposals.id,
        proposalStatus: proposals.status,
        proposalBody: proposals.body,
        proposalSentAt: proposals.sentAt,
        proposalRepliedAt: proposals.repliedAt,
      })
      .from(leads)
      .leftJoin(proposals, eq(proposals.leadId, leads.id))
      .where(eq(leads.searchId, id));

    return NextResponse.json({
      search: {
        id: search.id,
        query: search.query,
        industry: search.industry,
        location: search.location,
        totalFetched: search.totalFetched,
        totalWithoutWebsite: search.totalWithoutWebsite,
        createdAt: search.createdAt.toISOString(),
      },
      leads: leadRows.map((row) => ({
        id: row.id,
        title: row.title,
        placeId: row.placeId,
        address: row.address,
        phone: row.phone,
        rating: row.rating,
        reviews: row.reviews,
        type: row.type,
        mapsUrl: row.mapsUrl,
        thumbnail: row.thumbnail,
        hasWhatsapp: row.hasWhatsapp,
        proposal:
          row.proposalId && row.proposalBody
            ? {
                id: row.proposalId,
                status: row.proposalStatus as ProposalStatus,
                body: row.proposalBody,
                sentAt: row.proposalSentAt?.toISOString() ?? null,
                repliedAt: row.proposalRepliedAt?.toISOString() ?? null,
              }
            : null,
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "Failed to load search";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
