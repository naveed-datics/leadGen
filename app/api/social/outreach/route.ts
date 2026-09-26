import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/index";
import {
  businessContacts,
  leads,
  searchBusinesses,
  searches,
  socialOutreachJobs,
} from "@/lib/db/schema";
import { requireSocialAgent } from "@/lib/social-outreach/agent-guard";
import {
  pickFacebookPageUrl,
  splitSocialsCandidates,
} from "@/lib/social-outreach/facebook-url";
import {
  DEFAULT_OUTREACH_TEMPLATE,
  renderOutreachMessage,
} from "@/lib/social-outreach/template";

const CreateSchema = z.object({
  businessIds: z.array(z.string().uuid()).min(1).max(200),
  message: z.string().min(1).max(2000).optional(),
  campaignId: z.string().uuid().optional(),
});

/** Statuses that mean "a Facebook DM is already in flight or done" for a business. */
const BLOCKING_STATUSES = ["queued", "approved", "sending", "sent"] as const;

function errorResponse(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "Request failed";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET() {
  try {
    const user = await requireSocialAgent();
    const rows = await getDb()
      .select({
        id: socialOutreachJobs.id,
        businessId: socialOutreachJobs.searchBusinessId,
        businessName: searchBusinesses.title,
        targetUrl: socialOutreachJobs.targetUrl,
        body: socialOutreachJobs.body,
        status: socialOutreachJobs.status,
        reason: socialOutreachJobs.reason,
        sentAt: socialOutreachJobs.sentAt,
        createdAt: socialOutreachJobs.createdAt,
      })
      .from(socialOutreachJobs)
      .innerJoin(
        searchBusinesses,
        eq(searchBusinesses.id, socialOutreachJobs.searchBusinessId),
      )
      .where(eq(socialOutreachJobs.agentId, user.id))
      .orderBy(desc(socialOutreachJobs.createdAt))
      .limit(500);

    return NextResponse.json({
      jobs: rows.map((row) => ({
        ...row,
        sentAt: row.sentAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSocialAgent();

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = CreateSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const { businessIds, campaignId } = parsed.data;
    const template = parsed.data.message ?? DEFAULT_OUTREACH_TEMPLATE;
    const db = getDb();

    // Ownership: businesses must belong to one of this agent's searches.
    const owned = await db
      .select({
        id: searchBusinesses.id,
        title: searchBusinesses.title,
        website: searchBusinesses.website,
        industry: searches.industry,
      })
      .from(searchBusinesses)
      .innerJoin(searches, eq(searches.id, searchBusinesses.searchId))
      .where(
        and(
          inArray(searchBusinesses.id, businessIds),
          eq(searches.agentId, user.id),
        ),
      );
    const ownedById = new Map(owned.map((row) => [row.id, row]));

    const skipped: Array<{ businessId: string; reason: string }> = [];
    for (const id of businessIds) {
      if (!ownedById.has(id)) skipped.push({ businessId: id, reason: "not_found" });
    }
    const ownedIds = [...ownedById.keys()];
    if (ownedIds.length === 0) {
      return NextResponse.json({ created: 0, skipped });
    }

    const [contactRows, leadRows, existingRows] = await Promise.all([
      db
        .select({
          businessId: businessContacts.searchBusinessId,
          facebookUrl: businessContacts.facebookUrl,
        })
        .from(businessContacts)
        .where(inArray(businessContacts.searchBusinessId, ownedIds)),
      db
        .select({
          id: leads.id,
          businessId: leads.searchBusinessId,
          socials: leads.socials,
        })
        .from(leads)
        .where(inArray(leads.searchBusinessId, ownedIds)),
      db
        .select({ businessId: socialOutreachJobs.searchBusinessId })
        .from(socialOutreachJobs)
        .where(
          and(
            eq(socialOutreachJobs.agentId, user.id),
            eq(socialOutreachJobs.channel, "facebook"),
            inArray(socialOutreachJobs.searchBusinessId, ownedIds),
            inArray(socialOutreachJobs.status, [...BLOCKING_STATUSES]),
          ),
        ),
    ]);

    const alreadyQueued = new Set(existingRows.map((row) => row.businessId));
    const values: Array<typeof socialOutreachJobs.$inferInsert> = [];

    for (const id of ownedIds) {
      const business = ownedById.get(id)!;
      if (alreadyQueued.has(id)) {
        skipped.push({ businessId: id, reason: "already_queued_or_sent" });
        continue;
      }
      const lead = leadRows.find((row) => row.businessId === id);
      const candidates = [
        ...contactRows
          .filter((row) => row.businessId === id)
          .map((row) => row.facebookUrl),
        ...splitSocialsCandidates(lead?.socials),
        business.website,
      ];
      const targetUrl = pickFacebookPageUrl(candidates);
      if (!targetUrl) {
        skipped.push({ businessId: id, reason: "no_facebook_url" });
        continue;
      }
      values.push({
        agentId: user.id,
        searchBusinessId: id,
        leadId: lead?.id ?? null,
        campaignId: campaignId ?? null,
        channel: "facebook",
        targetUrl,
        body: renderOutreachMessage(template, {
          businessName: business.title,
          industry: business.industry ?? "local",
          senderName: user.name,
        }),
        status: "queued",
      });
    }

    if (values.length > 0) await db.insert(socialOutreachJobs).values(values);
    return NextResponse.json({ created: values.length, skipped });
  } catch (error) {
    return errorResponse(error);
  }
}
