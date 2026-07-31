import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { AuthError, requireActiveAgent } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/index";
import { leads, searches } from "@/lib/db/schema";
import { checkWhatsAppExists, delay } from "@/lib/whatsapp";

interface CheckItem {
  id: string;
  phone: string;
}

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

  let body: { searchId?: string; leads?: CheckItem[] };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const db = getDb();
  let toCheck: CheckItem[] = [];

  if (body.searchId) {
    const [search] = await db
      .select({ id: searches.id, agentId: searches.agentId })
      .from(searches)
      .where(eq(searches.id, body.searchId))
      .limit(1);

    if (!search || search.agentId !== agent.id) {
      return NextResponse.json({ error: "Search not found" }, { status: 404 });
    }

    const rows = await db
      .select({ id: leads.id, phone: leads.phone })
      .from(leads)
      .where(
        and(eq(leads.searchId, body.searchId), isNull(leads.hasWhatsapp)),
      );

    toCheck = rows
      .filter((row) => row.phone && row.phone.trim().length > 0)
      .map((row) => ({ id: row.id, phone: row.phone! }));
  } else if (body.leads?.length) {
    toCheck = body.leads.filter((l) => l.phone?.trim());
  }

  if (toCheck.length === 0) {
    return NextResponse.json({ results: {} });
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

  return NextResponse.json({ results });
}

export async function GET(request: Request) {
  const searchId = new URL(request.url).searchParams.get("searchId");

  if (!searchId) {
    return NextResponse.json({ error: "searchId is required" }, { status: 400 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "Database is not configured" },
      { status: 500 },
    );
  }

  try {
    const agent = await requireActiveAgent();
    const db = getDb();

    const [search] = await db
      .select({ id: searches.id, agentId: searches.agentId })
      .from(searches)
      .where(eq(searches.id, searchId))
      .limit(1);

    if (!search || search.agentId !== agent.id) {
      return NextResponse.json({ error: "Search not found" }, { status: 404 });
    }

    const rows = await db
      .select({
        id: leads.id,
        hasWhatsapp: leads.hasWhatsapp,
      })
      .from(leads)
      .where(eq(leads.searchId, searchId));

    const results: Record<string, boolean | null> = {};
    for (const row of rows) {
      results[row.id] = row.hasWhatsapp;
    }

    const needsCheck = rows.some((r) => r.hasWhatsapp === null);

    return NextResponse.json({ results, needsCheck });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
