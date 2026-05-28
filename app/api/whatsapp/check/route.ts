import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/index";
import { leads } from "@/lib/db/schema";
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

  let body: { searchId?: string; leads?: CheckItem[] };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const db = getDb();
  let toCheck: CheckItem[] = [];

  if (body.searchId) {
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
      results[item.id] = await checkWhatsAppExists(item.phone);
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

  const db = getDb();
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
}
