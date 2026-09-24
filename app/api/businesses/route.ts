import {
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  or,
  SQL,
} from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireAuth } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/index";
import { campaignBusinesses, campaigns, leads, searchBusinesses, searches } from "@/lib/db/schema";

/** Campaigns whose businesses are still considered "currently taken". */
const ACTIVE_CAMPAIGN_STATUSES = ["draft", "active"] as const;

const QuerySchema = z.object({
  industry: z.string().optional(),
  hasWebsite: z.enum(["true", "false"]).optional(),
  website: z.string().optional(),
  phone: z.string().optional(),
  hasWhatsapp: z.enum(["true", "false", "unchecked"]).optional(),
  hasSocials: z.enum(["true", "false"]).optional(),
  websiteState: z.enum(["ok", "down", "blocked", "error", "unchecked"]).optional(),
  location: z.string().optional(),
  copyrightMaxYear: z.coerce.number().int().optional(),
  q: z.string().optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  excludeCampaigned: z.enum(["true"]).optional(),
  campaign: z.string().uuid().optional(),
  campaignFilter: z.enum(["any", "none"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  format: z.enum(["json", "csv"]).optional(),
});

export type BusinessListItem = {
  id: string;
  title: string;
  industry: string;
  location: string;
  socials: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  hasWebsite: boolean;
  hasWhatsapp: boolean | null;
  websiteCheckState: string | null;
  websiteHttpStatus: number | null;
  websiteCheckedAt: string | null;
  copyrightText: string | null;
  copyrightYear: number | null;
  contactsFound: number | null;
  contactsStatus: string | null;
  contactsVerifiedAt: string | null;
  address: string | null;
  rating: number | null;
  reviews: number | null;
  mapsUrl: string | null;
  searchId: string;
  createdAt: string;
  /** Name of the campaign this business currently belongs to (draft/active only), if any. */
  campaignName: string | null;
};

function csvEscape(value: string | number | boolean | null | undefined): string {
  if (value == null) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function whatsappLabel(value: boolean | null): string {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "Unchecked";
}

function toCsv(rows: BusinessListItem[]): string {
  const header = [
    "Title",
    "Industry",
    "Location",
    "Socials",
    "Phone",
    "WhatsApp",
    "Website",
    "Has Website",
    "Website Status",
    "HTTP Status",
    "Copyright",
    "Copyright Year",
    "Contacts Found",
    "Contacts Status",
    "Address",
    "Rating",
    "Reviews",
    "Maps URL",
    "Search ID",
    "Created At",
    "Campaign",
  ];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        csvEscape(row.title),
        csvEscape(row.industry),
        csvEscape(row.location),
        csvEscape(row.socials),
        csvEscape(row.phone),
        csvEscape(whatsappLabel(row.hasWhatsapp)),
        csvEscape(row.website),
        csvEscape(row.hasWebsite ? "Yes" : "No"),
        csvEscape(row.websiteCheckState ?? ""),
        csvEscape(row.websiteHttpStatus),
        csvEscape(row.copyrightText),
        csvEscape(row.copyrightYear),
        csvEscape(row.contactsFound),
        csvEscape(row.contactsStatus ?? ""),
        csvEscape(row.address),
        csvEscape(row.rating),
        csvEscape(row.reviews),
        csvEscape(row.mapsUrl),
        csvEscape(row.searchId),
        csvEscape(row.createdAt),
        csvEscape(row.campaignName ?? ""),
      ].join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

export async function GET(request: Request) {
  try {
    const user = await requireAuth();
    const url = new URL(request.url);
    const parsed = QuerySchema.safeParse({
      industry: url.searchParams.get("industry") ?? undefined,
      hasWebsite: url.searchParams.get("hasWebsite") ?? undefined,
      website: url.searchParams.get("website") ?? undefined,
      phone: url.searchParams.get("phone") ?? undefined,
      hasWhatsapp: url.searchParams.get("hasWhatsapp") ?? undefined,
      hasSocials: url.searchParams.get("hasSocials") ?? undefined,
      websiteState: url.searchParams.get("websiteState") ?? undefined,
      location: url.searchParams.get("location") ?? undefined,
      copyrightMaxYear: url.searchParams.get("copyrightMaxYear") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
      minRating: url.searchParams.get("minRating") ?? undefined,
      excludeCampaigned: url.searchParams.get("excludeCampaigned") ?? undefined,
      campaign: url.searchParams.get("campaign") ?? undefined,
      campaignFilter: url.searchParams.get("campaignFilter") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined,
      format: url.searchParams.get("format") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query" }, { status: 400 });
    }

    const {
      industry,
      hasWebsite,
      website,
      phone,
      hasWhatsapp,
      hasSocials,
      websiteState,
      location,
      copyrightMaxYear,
      q,
      minRating,
      excludeCampaigned,
      campaign,
      campaignFilter,
      format = "json",
    } = parsed.data;
    const isCsv = format === "csv";
    const limit = isCsv ? Math.min(parsed.data.limit ?? 10_000, 10_000) : (parsed.data.limit ?? 100);
    const offset = isCsv ? 0 : (parsed.data.offset ?? 0);

    const filters: SQL[] = [];
    if (user.role === "agent") {
      filters.push(eq(searches.agentId, user.id));
    }
    if (industry?.trim()) {
      filters.push(eq(searches.industry, industry.trim()));
    }
    if (hasWebsite === "true") {
      filters.push(eq(searchBusinesses.hasWebsite, true));
    } else if (hasWebsite === "false") {
      filters.push(eq(searchBusinesses.hasWebsite, false));
    }
    if (website?.trim()) {
      filters.push(ilike(searchBusinesses.website, `%${website.trim()}%`));
    }
    if (phone?.trim()) {
      filters.push(ilike(searchBusinesses.phone, `%${phone.trim()}%`));
    }
    if (hasWhatsapp === "true") {
      filters.push(eq(leads.hasWhatsapp, true));
    } else if (hasWhatsapp === "false") {
      filters.push(eq(leads.hasWhatsapp, false));
    } else if (hasWhatsapp === "unchecked") {
      filters.push(isNull(leads.hasWhatsapp));
    }
    if (hasSocials === "true") {
      filters.push(and(isNotNull(leads.socials), ne(leads.socials, ""))!);
    } else if (hasSocials === "false") {
      filters.push(or(isNull(leads.socials), eq(leads.socials, ""))!);
    }
    if (websiteState === "unchecked") {
      filters.push(isNull(searchBusinesses.websiteCheckedAt));
    } else if (websiteState) {
      filters.push(eq(searchBusinesses.websiteCheckState, websiteState));
    }
    if (copyrightMaxYear != null) {
      filters.push(lte(searchBusinesses.copyrightYear, copyrightMaxYear));
    }
    if (minRating != null) {
      filters.push(gte(searchBusinesses.rating, minRating));
    }
    if (location?.trim()) {
      const term = `%${location.trim()}%`;
      filters.push(
        or(
          ilike(searches.location, term),
          ilike(searchBusinesses.address, term),
        )!,
      );
    }
    if (q?.trim()) {
      filters.push(ilike(searchBusinesses.title, `%${q.trim()}%`));
    }
    if (excludeCampaigned === "true") {
      filters.push(isNull(campaigns.id));
    }
    if (campaign) {
      filters.push(
        and(eq(campaignBusinesses.campaignId, campaign), isNotNull(campaigns.id))!,
      );
    } else if (campaignFilter === "none") {
      filters.push(isNull(campaigns.id));
    } else if (campaignFilter === "any") {
      filters.push(isNotNull(campaigns.id));
    }

    const whereClause = filters.length > 0 ? and(...filters) : undefined;
    const db = getDb();

    // "Has a campaign" only ever means "has a *current* (draft/active) one".
    // campaignBusinesses must be joined before campaigns (its own join
    // condition can only reference tables already in scope), so the status
    // check is applied on the campaigns join instead — campaigns.id ends up
    // null for historical (completed/archived) memberships, same net effect.
    const campaignsJoinCondition = and(
      eq(campaigns.id, campaignBusinesses.campaignId),
      inArray(campaigns.status, [...ACTIVE_CAMPAIGN_STATUSES]),
    );

    const [totalRow] = await db
      .select({ total: count() })
      .from(searchBusinesses)
      .innerJoin(searches, eq(searchBusinesses.searchId, searches.id))
      .leftJoin(leads, eq(leads.searchBusinessId, searchBusinesses.id))
      .leftJoin(
        campaignBusinesses,
        eq(campaignBusinesses.searchBusinessId, searchBusinesses.id),
      )
      .leftJoin(campaigns, campaignsJoinCondition)
      .where(whereClause);

    const rows = await db
      .select({
        id: searchBusinesses.id,
        title: searchBusinesses.title,
        industry: searches.industry,
        location: searches.location,
        phone: searchBusinesses.phone,
        email: searchBusinesses.email,
        website: searchBusinesses.website,
        hasWebsite: searchBusinesses.hasWebsite,
        hasWhatsapp: leads.hasWhatsapp,
        websiteCheckState: searchBusinesses.websiteCheckState,
        websiteHttpStatus: searchBusinesses.websiteHttpStatus,
        websiteCheckedAt: searchBusinesses.websiteCheckedAt,
        copyrightText: searchBusinesses.copyrightText,
        copyrightYear: searchBusinesses.copyrightYear,
        contactsFound: searchBusinesses.contactsFound,
        contactsStatus: searchBusinesses.contactsStatus,
        contactsVerifiedAt: searchBusinesses.contactsVerifiedAt,
        socials: leads.socials,
        address: searchBusinesses.address,
        rating: searchBusinesses.rating,
        reviews: searchBusinesses.reviews,
        mapsUrl: searchBusinesses.mapsUrl,
        searchId: searchBusinesses.searchId,
        createdAt: searchBusinesses.createdAt,
        campaignName: campaigns.name,
      })
      .from(searchBusinesses)
      .innerJoin(searches, eq(searchBusinesses.searchId, searches.id))
      .leftJoin(leads, eq(leads.searchBusinessId, searchBusinesses.id))
      .leftJoin(
        campaignBusinesses,
        eq(campaignBusinesses.searchBusinessId, searchBusinesses.id),
      )
      .leftJoin(campaigns, campaignsJoinCondition)
      .where(whereClause)
      .orderBy(
        desc(searches.createdAt),
        desc(searchBusinesses.createdAt),
        desc(searchBusinesses.id),
      )
      .limit(limit)
      .offset(offset);

    const items: BusinessListItem[] = rows.map((row) => ({
      id: row.id,
      title: row.title,
      industry: row.industry,
      location: row.location,
      socials: row.socials,
      phone: row.phone,
      email: row.email,
      website: row.website,
      hasWebsite: row.hasWebsite,
      hasWhatsapp: row.hasWhatsapp,
      websiteCheckState: row.websiteCheckState,
      websiteHttpStatus: row.websiteHttpStatus,
      websiteCheckedAt: row.websiteCheckedAt
        ? row.websiteCheckedAt.toISOString()
        : null,
      copyrightText: row.copyrightText,
      copyrightYear: row.copyrightYear,
      contactsFound: row.contactsFound,
      contactsStatus: row.contactsStatus,
      contactsVerifiedAt: row.contactsVerifiedAt
        ? row.contactsVerifiedAt.toISOString()
        : null,
      address: row.address,
      rating: row.rating,
      reviews: row.reviews,
      mapsUrl: row.mapsUrl,
      searchId: row.searchId,
      createdAt: row.createdAt.toISOString(),
      campaignName: row.campaignName,
    }));

    if (isCsv) {
      const csv = toCsv(items);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="businesses-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    return NextResponse.json({
      items,
      total: totalRow?.total ?? 0,
      limit,
      offset,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "Failed to load businesses";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
