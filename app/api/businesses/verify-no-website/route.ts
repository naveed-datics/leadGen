import { and, asc, count, eq, gt, isNull, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireActiveAgent } from "@/lib/auth/guards";
import {
  applyBusinessEnrichment,
  markBusinessEnrichError,
} from "@/lib/business-enrich";
import { getDb } from "@/lib/db/index";
import { searchBusinesses, searches } from "@/lib/db/schema";

export const maxDuration = 300;

const BodySchema = z.object({
  limit: z.number().int().min(1).max(20).optional(),
  resumeAfter: z.string().uuid().optional(),
  /** "new" = never verified; "all" = every no-website business. */
  mode: z.enum(["new", "all"]).optional(),
});

/**
 * Enrich is slow (external HTTP). Keep batches small so we stay under
 * the 300s route budget and can resume from the client loop.
 */
const DEFAULT_LIMIT = 3;

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "Database is not configured" },
      { status: 500 },
    );
  }

  let agent;
  try {
    agent = await requireActiveAgent();
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(json ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const limit = parsed.data.limit ?? DEFAULT_LIMIT;
  const resumeAfter = parsed.data.resumeAfter;
  const mode = parsed.data.mode ?? "new";
  const db = getDb();

  const baseFilters = [
    eq(searches.agentId, agent.id),
    eq(searchBusinesses.hasWebsite, false),
  ];

  if (mode === "new") {
    baseFilters.push(
      or(
        isNull(searchBusinesses.contactsVerifiedAt),
        eq(searchBusinesses.contactsStatus, "error"),
      )!,
    );
  }

  if (resumeAfter) {
    baseFilters.push(gt(searchBusinesses.id, resumeAfter));
  }

  const whereClause = and(...baseFilters);

  const [remainingRow] = await db
    .select({ total: count() })
    .from(searchBusinesses)
    .innerJoin(searches, eq(searchBusinesses.searchId, searches.id))
    .where(whereClause);

  const remainingEstimate = remainingRow?.total ?? 0;

  const rows = await db
    .select({
      id: searchBusinesses.id,
      searchId: searchBusinesses.searchId,
      title: searchBusinesses.title,
      placeId: searchBusinesses.placeId,
      address: searchBusinesses.address,
      phone: searchBusinesses.phone,
      rating: searchBusinesses.rating,
      reviews: searchBusinesses.reviews,
      type: searchBusinesses.type,
      mapsUrl: searchBusinesses.mapsUrl,
      thumbnail: searchBusinesses.thumbnail,
      latitude: searchBusinesses.latitude,
      longitude: searchBusinesses.longitude,
    })
    .from(searchBusinesses)
    .innerJoin(searches, eq(searchBusinesses.searchId, searches.id))
    .where(whereClause)
    .orderBy(asc(searchBusinesses.id))
    .limit(limit);

  if (rows.length === 0) {
    return NextResponse.json({
      complete: true,
      checked: 0,
      socialsUpdated: 0,
      websitesUpdated: 0,
      errors: 0,
      remainingEstimate: 0,
    });
  }

  let socialsUpdated = 0;
  let websitesUpdated = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      const result = await applyBusinessEnrichment(row);
      if (result.socialsUpdated) socialsUpdated += 1;
      if (result.websiteUpdated) websitesUpdated += 1;
    } catch {
      errors += 1;
      try {
        await markBusinessEnrichError(row.id);
      } catch {
        // ignore secondary write failures
      }
    }
  }

  const lastId = rows[rows.length - 1]?.id;
  const checked = rows.length;
  const remainingAfter = Math.max(0, remainingEstimate - checked);
  const complete = remainingAfter === 0;

  return NextResponse.json({
    complete,
    resumeAfter: complete ? undefined : lastId,
    checked,
    socialsUpdated,
    websitesUpdated,
    errors,
    remainingEstimate: remainingAfter,
  });
}
