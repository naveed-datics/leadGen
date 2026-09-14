/**
 * Business Enrichment Service (find-facebook-page).
 *
 * POST /enrich — looks up Facebook / Instagram / website for a business.
 * Base URL: FIND_FACEBOOK_PAGE_URL (default https://find-facebook-page.onrender.com)
 * Mode: FIND_FACEBOOK_PAGE_TYPE = "direct" | "google" (default "direct")
 */

export type EnrichLookupType = "direct" | "google";
export type EnrichMatchConfidence = "high" | "medium" | "low" | "none";

export interface EnrichMatch {
  url: string | null;
  match_confidence: EnrichMatchConfidence;
  reasoning: string | null;
}

export interface EnrichRequest {
  business_name: string;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  type?: EnrichLookupType;
}

export interface EnrichResponse {
  business_name: string;
  facebook: EnrichMatch;
  instagram: EnrichMatch;
  website: EnrichMatch;
  notes: string | null;
}

export interface ParsedUsAddress {
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
}

const DEFAULT_BASE_URL = "https://find-facebook-page.onrender.com";

/** Parse a typical US "street, City, ST ZIP" line into parts for /enrich. */
export function parseUsAddress(raw: string | null | undefined): ParsedUsAddress {
  const address = raw?.trim() || null;
  if (!address) {
    return { address: null, city: null, state: null, zip_code: null };
  }

  const zipMatch = address.match(/\b(\d{5})(?:-\d{4})?\s*$/);
  const zip_code = zipMatch?.[1] ?? null;

  const stateMatch = address.match(/,\s*([A-Z]{2})\s+\d{5}(?:-\d{4})?\s*$/i);
  const state = stateMatch?.[1]?.toUpperCase() ?? null;

  let city: string | null = null;
  if (state) {
    const cityMatch = address.match(
      new RegExp(`,\\s*([^,]+),\\s*${state}\\b`, "i"),
    );
    city = cityMatch?.[1]?.trim() || null;
  }

  return { address, city, state, zip_code };
}

function resolveBaseUrl(): string {
  const raw = process.env.FIND_FACEBOOK_PAGE_URL?.trim();
  if (!raw) return DEFAULT_BASE_URL;
  return raw.replace(/\/+$/, "");
}

function resolveLookupType(): EnrichLookupType {
  const raw = process.env.FIND_FACEBOOK_PAGE_TYPE?.trim().toLowerCase();
  return raw === "google" ? "google" : "direct";
}

function normalizeMatch(raw: unknown): EnrichMatch {
  if (!raw || typeof raw !== "object") {
    return { url: null, match_confidence: "none", reasoning: null };
  }
  const obj = raw as Record<string, unknown>;
  const url = typeof obj.url === "string" && obj.url.trim() ? obj.url.trim() : null;
  const confidenceRaw =
    typeof obj.match_confidence === "string" ? obj.match_confidence : "none";
  const match_confidence: EnrichMatchConfidence =
    confidenceRaw === "high" ||
    confidenceRaw === "medium" ||
    confidenceRaw === "low"
      ? confidenceRaw
      : "none";
  const reasoning =
    typeof obj.reasoning === "string" && obj.reasoning.trim()
      ? obj.reasoning.trim()
      : null;
  return { url, match_confidence, reasoning };
}

/** True when the enricher returned a usable URL (not none / empty). */
export function hasUsableEnrichUrl(match: EnrichMatch | null | undefined): boolean {
  return Boolean(match?.url?.trim()) && match?.match_confidence !== "none";
}

export async function enrichBusiness(
  input: EnrichRequest,
): Promise<EnrichResponse> {
  const baseUrl = resolveBaseUrl();
  const body: EnrichRequest = {
    business_name: input.business_name.trim(),
    phone: input.phone?.trim() || null,
    address: input.address?.trim() || null,
    city: input.city?.trim() || null,
    state: input.state?.trim() || null,
    zip_code: input.zip_code?.trim() || null,
    type: input.type ?? resolveLookupType(),
  };

  if (!body.business_name) {
    throw new Error("business_name is required for enrichment");
  }

  const response = await fetch(`${baseUrl}/enrich`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Enrichment failed (${response.status}): ${text.slice(0, 300)}`,
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Enrichment returned non-JSON: ${text.slice(0, 200)}`);
  }

  if (!data || typeof data !== "object") {
    throw new Error("Enrichment returned an invalid payload");
  }

  const obj = data as Record<string, unknown>;
  return {
    business_name:
      typeof obj.business_name === "string"
        ? obj.business_name
        : body.business_name,
    facebook: normalizeMatch(obj.facebook),
    instagram: normalizeMatch(obj.instagram),
    website: normalizeMatch(obj.website),
    notes: typeof obj.notes === "string" ? obj.notes : null,
  };
}
