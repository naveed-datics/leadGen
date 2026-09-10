import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireAuth } from "@/lib/auth/guards";
import {
  findCompanyContacts,
  isB2bLeadsConfigured,
  toCompanyQuery,
  type B2BLead,
} from "@/lib/b2b-leads";
import { getDb } from "@/lib/db/index";
import { businessContacts, searchBusinesses, searches } from "@/lib/db/schema";

export const maxDuration = 300;

/** Don't re-run a lookup that succeeded within this window unless force=true. */
const REVERIFY_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
/**
 * Cost ceiling per lookup, in USD. The actor rejects any value below $0.50, so
 * this is its enforced minimum — a safety cap, not the expected cost. A single
 * small-business lookup returns a handful of leads at ~$0.003-0.005 each; empty
 * runs are not charged.
 */
const MAX_CHARGE_USD = 0.5;

const BodySchema = z.object({
  force: z.boolean().optional(),
  jobTitles: z.array(z.string().min(1).max(60)).max(10).optional(),
  maxLeads: z.number().int().min(1).max(25).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

/** Every stored field — the popup shows all of them. */
const CONTACT_COLUMNS = {
  id: businessContacts.id,
  name: businessContacts.name,
  jobTitle: businessContacts.jobTitle,
  linkedinUrl: businessContacts.linkedinUrl,
  email: businessContacts.email,
  emailConfidence: businessContacts.emailConfidence,
  emailPattern: businessContacts.emailPattern,
  phone: businessContacts.phone,
  phoneSource: businessContacts.phoneSource,
  source: businessContacts.source,
  scrapedAt: businessContacts.scrapedAt,
  rawJson: businessContacts.rawJson,
} as const;

async function loadContacts(businessId: string) {
  const db = getDb();
  return db
    .select(CONTACT_COLUMNS)
    .from(businessContacts)
    .where(eq(businessContacts.searchBusinessId, businessId))
    .orderBy(asc(businessContacts.createdAt));
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { id } = await context.params;

    if (!process.env.DATABASE_URL) {
      return NextResponse.json(
        { error: "Database is not configured" },
        { status: 500 },
      );
    }
    if (!isB2bLeadsConfigured()) {
      return NextResponse.json(
        { error: "APIFY_API_TOKEN is not configured" },
        { status: 503 },
      );
    }

    let json: unknown = {};
    try {
      json = await request.json();
    } catch {
      json = {};
    }
    const parsed = BodySchema.safeParse(json ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const db = getDb();

    const [business] = await db
      .select({
        id: searchBusinesses.id,
        title: searchBusinesses.title,
        contactsVerifiedAt: searchBusinesses.contactsVerifiedAt,
        contactsStatus: searchBusinesses.contactsStatus,
      })
      .from(searchBusinesses)
      .innerJoin(searches, eq(searchBusinesses.searchId, searches.id))
      .where(
        and(
          eq(searchBusinesses.id, id),
          user.role === "agent" ? eq(searches.agentId, user.id) : undefined,
        ),
      )
      .limit(1);

    if (!business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    const force = parsed.data.force ?? false;
    const recentlyOk =
      business.contactsStatus === "ok" &&
      business.contactsVerifiedAt != null &&
      Date.now() - business.contactsVerifiedAt.getTime() < REVERIFY_COOLDOWN_MS;

    if (recentlyOk && !force) {
      const existing = await loadContacts(id);
      return NextResponse.json({
        cached: true,
        found: existing.length,
        contacts: existing,
      });
    }

    const company = toCompanyQuery(business.title);

    let leads: B2BLead[];
    try {
      leads = await findCompanyContacts({
        company,
        jobTitles: parsed.data.jobTitles,
        maxLeads: parsed.data.maxLeads ?? 10,
        maxTotalChargeUsd: MAX_CHARGE_USD,
      });
    } catch (error) {
      await db
        .update(searchBusinesses)
        .set({ contactsStatus: "error", contactsVerifiedAt: new Date() })
        .where(eq(searchBusinesses.id, id));
      const message =
        error instanceof Error ? error.message : "Contact lookup failed";
      return NextResponse.json({ error: message }, { status: 502 });
    }

    const verifiedAt = new Date();

    await db
      .delete(businessContacts)
      .where(eq(businessContacts.searchBusinessId, id));

    if (leads.length > 0) {
      await db.insert(businessContacts).values(
        leads.map((lead) => ({
          searchBusinessId: id,
          name: lead.name,
          jobTitle: lead.jobTitle,
          linkedinUrl: lead.linkedinUrl,
          email: lead.email,
          emailConfidence: lead.emailConfidence,
          emailPattern: lead.emailPattern,
          phone: lead.phone,
          phoneSource: lead.phoneSource,
          source: lead.source,
          scrapedAt: lead.scrapedAt ? new Date(lead.scrapedAt) : null,
          rawJson: lead.raw,
        })),
      );
    }

    await db
      .update(searchBusinesses)
      .set({
        contactsVerifiedAt: verifiedAt,
        contactsFound: leads.length,
        contactsStatus: leads.length > 0 ? "ok" : "none",
      })
      .where(eq(searchBusinesses.id, id));

    return NextResponse.json({
      cached: false,
      query: company,
      found: leads.length,
      contacts: await loadContacts(id),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "Failed to verify contacts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
