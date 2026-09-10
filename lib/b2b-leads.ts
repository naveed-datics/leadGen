/**
 * B2B Leads Finder | Like Apollo (Apify actor themineworks/b2b-leads-finder,
 * id MFZAYRfxMqYUaHBXm).
 *
 * Given a company name, returns public contact people: name, title, LinkedIn
 * URL, and — when published anywhere — a business email and company phone.
 * Searched live at run time — no shared database, no login.
 *
 * The actor has NO location parameter. It matches each LinkedIn candidate's
 * company against the exact string in `companies`, so anything appended to the
 * name (city, state, address) makes every candidate fail the match. Pass the
 * bare business name only.
 */

const DEFAULT_ACTOR_ID = "themineworks~b2b-leads-finder";
const SYNC_TIMEOUT_SEC = 280;

export interface B2BLead {
  company: string | null;
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
  /** The complete unmodified actor record, for the details popup. */
  raw: Record<string, unknown>;
}

export interface FindCompanyContactsOptions {
  /** Bare company name (no city/state/address — see file header). */
  company: string;
  /** Optional job-title keyword filter. Omit to return every role (default). */
  jobTitles?: string[];
  maxLeads?: number;
  /** Hard ceiling on Apify spend for this run, in USD (actor minimum is 0.5). */
  maxTotalChargeUsd?: number;
}

export function isB2bLeadsConfigured(): boolean {
  return Boolean(process.env.APIFY_API_TOKEN?.trim());
}

function getActorId(): string {
  return process.env.APIFY_B2B_LEADS_ACTOR_ID?.trim() || DEFAULT_ACTOR_ID;
}

/**
 * The actor call key. Deliberately the plain business name — the actor cannot
 * use a location and appending one returns zero results.
 */
export function toCompanyQuery(title: string): string {
  return title.trim();
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function mapLead(raw: Record<string, unknown>): B2BLead | null {
  const name = str(raw.name);
  if (!name) return null;
  return {
    company: str(raw.company),
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
    raw,
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

  const body: Record<string, unknown> = {
    companies: [options.company],
    maxLeadsPerCompany: options.maxLeads ?? 10,
    scrapeWebsite: true,
    proxy: { useApifyProxy: true, apifyProxyGroups: ["GOOGLE_SERP"] },
  };
  // Only constrain by title when the caller explicitly asks — an unmatched
  // filter silently returns zero leads for small businesses.
  if (options.jobTitles && options.jobTitles.length > 0) {
    body.jobTitles = options.jobTitles;
  }

  const response = await fetch(endpoint.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout((SYNC_TIMEOUT_SEC + 15) * 1000),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `B2B Leads Finder failed (${response.status}): ${text.slice(0, 300)}`,
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    // A 200 with a non-JSON body is an upstream gateway/error page, not "no
    // results" — surface it so the caller records an error, not an empty run.
    throw new Error(
      `B2B Leads Finder returned a non-JSON response: ${text.slice(0, 200)}`,
    );
  }

  if (!Array.isArray(data)) return [];

  const leads: B2BLead[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    // The actor appends `_type: "summary"` and `_type: "info"` trailer rows.
    if ("_type" in record) continue;
    const mapped = mapLead(record);
    if (mapped) leads.push(mapped);
  }
  return leads;
}
