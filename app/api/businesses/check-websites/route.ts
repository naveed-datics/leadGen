import { and, asc, count, eq, gt, isNotNull, isNull, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireActiveAgent } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/index";
import { searchBusinesses, searches } from "@/lib/db/schema";
import { checkWebsite } from "@/lib/website-health";
import { delay } from "@/lib/whatsapp";

export const maxDuration = 300;

const BodySchema = z.object({
  limit: z.number().int().min(1).max(200).optional(),
  resumeAfter: z.string().uuid().optional(),
  /** "new" = only businesses never checked; "all" = re-check everything. */
  mode: z.enum(["new", "all"]).optional(),
});

/** Scan this many businesses per request; fits the 300s function budget. */
const DEFAULT_LIMIT = 50;
/** Concurrent fetches per wave — polite, and keeps memory flat. */
const CONCURRENCY = 8;
/** Breather between waves. */
const WAVE_DELAY_MS = 200;

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
    isNotNull(searchBusinesses.website),
    ne(searchBusinesses.website, ""),
  ];

  if (mode === "new") {
    baseFilters.push(isNull(searchBusinesses.websiteCheckedAt));
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
      website: searchBusinesses.website,
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
      down: 0,
      blocked: 0,
      scraped: 0,
      remainingEstimate: 0,
    });
  }

  let down = 0;
  let blocked = 0;
  let scraped = 0;
  const checkedAt = new Date();

  for (let start = 0; start < rows.length; start += CONCURRENCY) {
    const wave = rows.slice(start, start + CONCURRENCY);

    const results = await Promise.all(
      wave.map(async (row) => {
        const website = row.website?.trim() ?? "";
        if (!website) return null;
        const result = await checkWebsite(website);
        return { id: row.id, result };
      }),
    );

    for (const entry of results) {
      if (!entry) continue;
      const { id, result } = entry;

      if (result.state === "down") down += 1;
      if (result.state === "blocked") blocked += 1;
      if (result.copyrightText) scraped += 1;

      await db
        .update(searchBusinesses)
        .set({
          websiteHttpStatus: result.httpStatus,
          websiteCheckState: result.state,
          websiteCheckedAt: checkedAt,
          copyrightText: result.copyrightText,
          copyrightYear: result.copyrightYear,
        })
        .where(eq(searchBusinesses.id, id));
    }

    if (start + CONCURRENCY < rows.length) {
      await delay(WAVE_DELAY_MS);
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
    down,
    blocked,
    scraped,
    remainingEstimate: remainingAfter,
  });
}
