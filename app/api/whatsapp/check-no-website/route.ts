import { and, asc, count, eq, gt, isNotNull, isNull, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireActiveAgent } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/index";
import { leads, searches } from "@/lib/db/schema";
import { checkWhatsAppExists, delay } from "@/lib/whatsapp";

export const maxDuration = 300;

const BodySchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  resumeAfter: z.string().uuid().optional(),
});

const DEFAULT_LIMIT = 40;

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
    isNull(leads.hasWhatsapp),
    isNotNull(leads.phone),
    ne(leads.phone, ""),
  ];

  if (resumeAfter) {
    baseFilters.push(gt(leads.id, resumeAfter));
  }

  const whereClause = and(...baseFilters);

  const [remainingRow] = await db
    .select({ total: count() })
    .from(leads)
    .innerJoin(searches, eq(leads.searchId, searches.id))
    .where(whereClause);

  const remainingEstimate = remainingRow?.total ?? 0;

  const rows = await db
    .select({
      id: leads.id,
      phone: leads.phone,
    })
    .from(leads)
    .innerJoin(searches, eq(leads.searchId, searches.id))
    .where(whereClause)
    .orderBy(asc(leads.id))
    .limit(limit);

  const toCheck = rows
    .filter((row) => row.phone && row.phone.trim().length > 0)
    .map((row) => ({ id: row.id, phone: row.phone! }));

  if (toCheck.length === 0) {
    return NextResponse.json({
      complete: true,
      checked: 0,
      remainingEstimate: 0,
      results: {},
    });
  }

  const results: Record<string, boolean> = {};

  for (let i = 0; i < toCheck.length; i++) {
    const item = toCheck[i];
    try {
      results[item.id] = await checkWhatsAppExists(item.phone, agent.id);
    } catch {
      results[item.id] = false;
    }

    if (i < toCheck.length - 1) {
      await delay(350);
    }
  }

  const now = new Date();
  await Promise.all(
    Object.entries(results).map(([leadId, hasWhatsapp]) =>
      db
        .update(leads)
        .set({ hasWhatsapp, whatsappCheckedAt: now })
        .where(eq(leads.id, leadId)),
    ),
  );

  const lastId = toCheck[toCheck.length - 1]?.id;
  const checked = toCheck.length;
  const remainingAfter = Math.max(0, remainingEstimate - checked);
  const complete = remainingAfter === 0;

  return NextResponse.json({
    complete,
    resumeAfter: complete ? undefined : lastId,
    checked,
    remainingEstimate: remainingAfter,
    results,
  });
}
