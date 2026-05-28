import type { WebsiteStats } from "@/lib/types";

/** Pay-per-event actor — works with Apify free monthly credits (no actor rental). */
const DEFAULT_ACTOR = "ecomdate~similarweb-scraper";
const DATASCOUT_ACTOR = "datascoutapi~website-traffic-analysis";
const APIFY_SYNC_TIMEOUT_SEC = 120;

export function getApifyActorId(): string {
  return process.env.APIFY_TRAFFIC_ACTOR_ID?.trim() || DEFAULT_ACTOR;
}

export function getApifyActorUrl(): string {
  return `https://api.apify.com/v2/acts/${getApifyActorId()}/run-sync-get-dataset-items`;
}

export function isApifyConfigured(): boolean {
  return Boolean(process.env.APIFY_API_TOKEN?.trim());
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

export function extractDomain(url: string): string | null {
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function formatAgeFromDate(date: Date): string {
  const years = Math.floor(
    (Date.now() - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000),
  );
  if (years < 1) {
    const months = Math.max(
      1,
      Math.floor((Date.now() - date.getTime()) / (30 * 24 * 60 * 60 * 1000)),
    );
    return `${months} month${months === 1 ? "" : "s"}`;
  }
  return `${years} year${years === 1 ? "" : "s"}`;
}

function formatSnapshotDate(iso: string): string | null {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  return null;
}

function latestMonthlyVisits(
  estimated: unknown,
): number | null {
  if (!estimated || typeof estimated !== "object") return null;
  const entries = Object.entries(estimated as Record<string, number>)
    .filter(([, v]) => typeof v === "number")
    .sort(([a], [b]) => b.localeCompare(a));
  return entries[0]?.[1] ?? null;
}

function buildActorInput(actorId: string, domain: string): Record<string, unknown> {
  if (actorId.includes("ecomdate") || actorId.includes("similarweb-scraper")) {
    return { domains: [domain] };
  }
  if (actorId.includes("pro100chok")) {
    return { domains: [domain] };
  }
  return { url: domain };
}

function parseTrafficFromText(text: string): {
  trafficLabel: string | null;
  trafficEstimate: string | null;
} {
  const rankMatch = text.match(/global\s*rank\s*[:#]?\s*([^\n,;]+)/i);
  const visitorsMatch = text.match(/daily\s*visitors?\s*[:=]?\s*([^\n,;]+)/i);
  const pageviewsMatch = text.match(/daily\s*pageviews?\s*[:=]?\s*([^\n,;]+)/i);

  return {
    trafficLabel: rankMatch?.[1]?.trim() ?? null,
    trafficEstimate:
      visitorsMatch?.[1]?.trim() ??
      (pageviewsMatch?.[1]
        ? `${pageviewsMatch[1].trim()} pageviews/day`
        : null),
  };
}

function unwrapApifyItem(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  if (raw.OUTPUT && typeof raw.OUTPUT === "object") {
    return raw.OUTPUT as Record<string, unknown>;
  }
  return raw;
}

export function parseApifyResult(
  raw: Record<string, unknown>,
): Partial<WebsiteStats> {
  const item = unwrapApifyItem(raw);
  const partial: Partial<WebsiteStats> = {
    source: "apify",
  };

  if (typeof item.globalRank === "number") {
    partial.trafficLabel = `#${formatNumber(item.globalRank)}`;
  }

  if (typeof item.totalVisits === "number") {
    partial.trafficEstimate = `${formatNumber(item.totalVisits)} visits/mo`;
  } else {
    const latest = latestMonthlyVisits(item.estimatedMonthlyVisits);
    if (latest != null) {
      partial.trafficEstimate = `${formatNumber(latest)} visits/mo`;
    }
  }

  if (typeof item.categoryRank === "number" && !partial.trafficLabel) {
    partial.trafficLabel = `Category #${formatNumber(item.categoryRank)}`;
  }

  const snapshotDate =
    typeof item.snapshotDate === "string" ? item.snapshotDate : null;
  if (snapshotDate) {
    partial.lastUpdated = formatSnapshotDate(snapshotDate);
  }

  const globalRank = item.globalRank;
  if (typeof globalRank === "string") {
    const fromText = parseTrafficFromText(globalRank);
    partial.trafficLabel ??= fromText.trafficLabel;
    partial.trafficEstimate ??= fromText.trafficEstimate;
  } else if (globalRank && typeof globalRank === "object") {
    const rank = globalRank as Record<string, unknown>;
    partial.trafficLabel ??=
      pickString(rank, ["Global rank", "globalRank", "rank", "Rank"]) ?? null;
    partial.trafficEstimate ??=
      pickString(rank, [
        "Daily visitors",
        "dailyVisitors",
        "Monthly visitors",
        "monthlyVisitors",
        "Visits",
      ]) ?? null;

    if (!partial.trafficEstimate) {
      const pageviews = pickString(rank, ["Daily pageviews", "dailyPageviews"]);
      if (pageviews) partial.trafficEstimate = `${pageviews} pageviews/day`;
    }
  }

  const trafficAnalysis = item.trafficAnalysis;
  if (
    typeof trafficAnalysis === "string" &&
    (!partial.trafficEstimate || !partial.trafficLabel)
  ) {
    const fromText = parseTrafficFromText(trafficAnalysis);
    partial.trafficLabel ??= fromText.trafficLabel;
    partial.trafficEstimate ??= fromText.trafficEstimate;
  }

  const domainData = item.domainData;
  if (domainData && typeof domainData === "object") {
    const data = domainData as Record<string, unknown>;
    const created =
      pickString(data, [
        "creation_date",
        "creationDate",
        "created",
        "registered",
      ]) ?? null;
    if (created) {
      const parsed = new Date(created);
      if (!Number.isNaN(parsed.getTime())) {
        partial.websiteAge = formatAgeFromDate(parsed);
      } else {
        partial.websiteAge = created;
      }
    }
  }

  const seo = item.seo;
  if (seo && typeof seo === "object") {
    const seoData = seo as Record<string, unknown>;
    const updated = pickString(seoData, [
      "last_modified",
      "lastModified",
      "updated",
    ]);
    if (updated) partial.lastUpdated = updated;
  }

  return partial;
}

export class ApifyActorNotRentedError extends Error {
  constructor() {
    super("APIFY_ACTOR_NOT_RENTED");
    this.name = "ApifyActorNotRentedError";
  }
}

function parseApifyError(data: unknown): Error | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (record.error && typeof record.error === "object") {
    const err = record.error as { message?: string; type?: string };
    if (err.type === "actor-is-not-rented") {
      return new ApifyActorNotRentedError();
    }
    return new Error(err.message ?? "Apify request failed");
  }
  return null;
}

/**
 * Runs Apify SimilarWeb traffic actor (sync) and returns dataset items.
 */
export async function runApifyTrafficAnalysis(
  websiteUrl: string,
): Promise<Record<string, unknown>[]> {
  const token = process.env.APIFY_API_TOKEN?.trim();
  if (!token) {
    throw new Error("APIFY_API_TOKEN is not configured");
  }

  const domain = extractDomain(websiteUrl) ?? websiteUrl.trim();
  const actorId = getApifyActorId();

  const endpoint = new URL(getApifyActorUrl());
  endpoint.searchParams.set("token", token);
  endpoint.searchParams.set("timeout", String(APIFY_SYNC_TIMEOUT_SEC));

  const response = await fetch(endpoint.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildActorInput(actorId, domain)),
    signal: AbortSignal.timeout((APIFY_SYNC_TIMEOUT_SEC + 10) * 1000),
  });

  const data: unknown = await response.json();

  const apiError = parseApifyError(data);
  if (apiError) {
    throw apiError;
  }

  if (!response.ok) {
    const text =
      typeof data === "string" ? data : JSON.stringify(data).slice(0, 300);
    throw new Error(
      `Apify request failed (${response.status}): ${text}`,
    );
  }

  if (Array.isArray(data)) {
    return data as Record<string, unknown>[];
  }
  if (data && typeof data === "object") {
    return [data as Record<string, unknown>];
  }
  return [];
}

/**
 * Fetches website traffic and domain stats via Apify actor.
 */
export async function fetchApifyWebsiteStats(
  websiteUrl: string,
): Promise<Partial<WebsiteStats>> {
  if (!isApifyConfigured()) {
    return { source: "apify" };
  }

  const domain = extractDomain(websiteUrl) ?? websiteUrl.trim();
  const items = await runApifyTrafficAnalysis(domain);
  const match =
    items.find(
      (row) =>
        typeof row.domain === "string" &&
        row.domain.replace(/^www\./, "") === domain,
    ) ?? items[0];

  if (!match || typeof match !== "object") {
    return {
      source: "apify",
      trafficError: "No traffic data returned from Apify",
    };
  }

  const parsed = parseApifyResult(match);
  const hasTraffic = Boolean(parsed.trafficLabel || parsed.trafficEstimate);

  if (!hasTraffic) {
    return {
      ...parsed,
      source: "apify",
      trafficError: "Apify returned no traffic metrics for this site",
    };
  }

  return parsed;
}

export { DATASCOUT_ACTOR, DEFAULT_ACTOR };
