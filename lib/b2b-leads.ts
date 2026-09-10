/**
 * B2B Leads Finder | Like Apollo (Apify actor themineworks/b2b-leads-finder).
 *
 * Given a company name or domain, returns public contact people: name, title,
 * LinkedIn URL, business email (with confidence), and any company phone.
 * Searched live at run time — no shared database, no login.
 */

import { extractDomain } from "@/lib/apify-traffic";

const DEFAULT_ACTOR_ID = "themineworks~b2b-leads-finder";
const SYNC_TIMEOUT_SEC = 280;

/** Decision-maker titles we bias the search toward when the caller gives none. */
export const DEFAULT_JOB_TITLES = [
  "CEO",
  "Owner",
  "Founder",
  "President",
  "Managing Director",
  "Partner",
];

export interface B2BLead {
  name: string;
  jobTitle: string | null;
  linkedinUrl: string | null;
  email: string | null;
  emailConfidence: string | null;
  emailPattern: string | null;
  phone: string | null;
  phoneSource: string | null;
  source: string | null;
  scrapedAt: string | null;
}

export interface FindCompanyContactsOptions {
  /** Company domain (preferred) or name. */
  company: string;
  jobTitles?: string[];
  maxLeads?: number;
  /** Hard ceiling on Apify spend for this run, in USD. */
  maxTotalChargeUsd?: number;
}

export function isB2bLeadsConfigured(): boolean {
  return Boolean(process.env.APIFY_API_TOKEN?.trim());
}

function getActorId(): string {
  return process.env.APIFY_B2B_LEADS_ACTOR_ID?.trim() || DEFAULT_ACTOR_ID;
}

/** Prefer a bare domain (best for email building); fall back to the raw string. */
export function toCompanyQuery(
  website: string | null | undefined,
  title: string,
  location: string | null | undefined,
): string {
  const domain = website ? extractDomain(website) : null;
  if (domain) return domain;
  const city = location?.split(",")[0]?.trim();
  return city ? `${title} ${city}` : title;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function mapLead(raw: Record<string, unknown>): B2BLead | null {
  const name = str(raw.name);
  if (!name) return null;
  return {
    name,
    jobTitle: str(raw.job_title),
    linkedinUrl: str(raw.linkedin_url),
    email: str(raw.email),
    emailConfidence: str(raw.email_confidence),
    emailPattern: str(raw.email_pattern),
    phone: str(raw.phone),
    phoneSource: str(raw.phone_source),
    source: str(raw.source),
    scrapedAt: str(raw.scraped_at),
  };
}

export async function findCompanyContacts(
  options: FindCompanyContactsOptions,
): Promise<B2BLead[]> {
  const token = process.env.APIFY_API_TOKEN?.trim();
  if (!token) {
    throw new Error("APIFY_API_TOKEN is not configured");
  }

  const endpoint = new URL(
    `https://api.apify.com/v2/acts/${getActorId()}/run-sync-get-dataset-items`,
  );
  endpoint.searchParams.set("token", token);
  endpoint.searchParams.set("timeout", String(SYNC_TIMEOUT_SEC));
  if (options.maxTotalChargeUsd != null) {
    endpoint.searchParams.set(
      "maxTotalChargeUsd",
      String(options.maxTotalChargeUsd),
    );
  }

  const body = {
    companies: [options.company],
    jobTitles: options.jobTitles ?? DEFAULT_JOB_TITLES,
    maxLeadsPerCompany: options.maxLeads ?? 10,
    scrapeWebsite: true,
    proxy: { useApifyProxy: true, apifyProxyGroups: ["GOOGLE_SERP"] },
  };

  const response = await fetch(endpoint.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout((SYNC_TIMEOUT_SEC + 15) * 1000),
  });

  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const detail =
      data && typeof data === "object"
        ? JSON.stringify(data).slice(0, 300)
        : String(data);
    throw new Error(`B2B Leads Finder failed (${response.status}): ${detail}`);
  }

  if (!Array.isArray(data)) return [];

  const leads: B2BLead[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    // The actor appends one informational trailer row — never a real lead.
    if (record._type === "info") continue;
    const mapped = mapLead(record);
    if (mapped) leads.push(mapped);
  }
  return leads;
}
