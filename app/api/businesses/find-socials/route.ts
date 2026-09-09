import { and, asc, count, eq, gt, isNotNull, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireActiveAgent } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/index";
import { leads, searchBusinesses, searches } from "@/lib/db/schema";
import {
  isInstagramOrFacebookUrl,
  mergeSocials,
  normalizeSocialUrl,
} from "@/lib/social-urls";

export const maxDuration = 300;

const BodySchema = z.object({
  limit: z.number().int().min(1).max(500).optional(),
  resumeAfter: z.string().uuid().optional(),
});

/** Scan this many businesses with a website per request; filter IG/FB in memory. */
const DEFAULT_LIMIT = 200;

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
  const db = getDb();

  const baseFilters = [
    eq(searches.agentId, agent.id),
    isNotNull(searchBusinesses.website),
    ne(searchBusinesses.website, ""),
  ];

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
      website: searchBusinesses.website,
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
      moved: 0,
      remainingEstimate: 0,
    });
  }

  let moved = 0;

  for (const row of rows) {
    const website = row.website?.trim() || "";
    if (!website || !isInstagramOrFacebookUrl(website)) {
      continue;
    }

    const socialUrl = normalizeSocialUrl(website);

    const [existingLead] = await db
      .select({
        id: leads.id,
        socials: leads.socials,
      })
      .from(leads)
      .where(eq(leads.searchBusinessId, row.id))
      .limit(1);

    if (existingLead) {
      await db
        .update(leads)
        .set({ socials: mergeSocials(existingLead.socials, [socialUrl]) })
        .where(eq(leads.id, existingLead.id));
    } else {
      await db.insert(leads).values({
        searchId: row.searchId,
        searchBusinessId: row.id,
        title: row.title,
        placeId: row.placeId,
        address: row.address,
        phone: row.phone,
        rating: row.rating,
        reviews: row.reviews,
        type: row.type,
        mapsUrl: row.mapsUrl,
        thumbnail: row.thumbnail,
        latitude: row.latitude,
        longitude: row.longitude,
        socials: mergeSocials(null, [socialUrl]),
      });
    }

    await db
      .update(searchBusinesses)
      .set({ website: null, hasWebsite: false })
      .where(eq(searchBusinesses.id, row.id));

    moved += 1;
  }

  const lastId = rows[rows.length - 1]?.id;
  const checked = rows.length;
  const remainingAfter = Math.max(0, remainingEstimate - checked);
  const complete = remainingAfter === 0;

  return NextResponse.json({
    complete,
    resumeAfter: complete ? undefined : lastId,
    checked,
    moved,
    remainingEstimate: remainingAfter,
  });
}
