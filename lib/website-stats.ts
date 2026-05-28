import { eq } from "drizzle-orm";
import {
  ApifyActorNotRentedError,
  fetchApifyWebsiteStats,
  isApifyConfigured,
} from "@/lib/apify-traffic";
import { estimateWebsiteStats, getAzureOpenAIConfig } from "@/lib/azure-openai";
import { getDb } from "@/lib/db/index";
import { websiteStatsCache } from "@/lib/db/schema";
import type { WebsiteStats, WebsiteStatsSource } from "@/lib/types";

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

export interface GetWebsiteStatsOptions {
  bypassCache?: boolean;
}

export const APIFY_RENT_URL = "https://apify.com/ecomdate/similarweb-scraper";

export const APIFY_RENT_MESSAGE =
  "Traffic uses Apify SimilarWeb data (pay-per-use, free credits apply). AI estimates used only when Apify has no data.";

function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function extractDomain(url: string): string | null {
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

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

async function fetchRdapDomainAge(domain: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const response = await fetch(`https://rdap.org/domain/${domain}`, {
      signal: controller.signal,
      headers: { Accept: "application/rdap+json" },
    });
    clearTimeout(timeout);
    if (!response.ok) return null;

    const data = (await response.json()) as {
      events?: { eventAction?: string; eventDate?: string }[];
    };
    const registration = data.events?.find(
      (e) => e.eventAction === "registration" && e.eventDate,
    );
    if (!registration?.eventDate) return null;
    return formatAgeFromDate(new Date(registration.eventDate));
  } catch {
    return null;
  }
}

async function fetchPageSignals(url: string): Promise<{
  lastUpdated: string | null;
  pageTitle: string | null;
  reachable: boolean;
}> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const response = await fetch(normalizeUrl(url), {
      signal: controller.signal,
      headers: { "User-Agent": "LeadGen/1.0 (website-stats)" },
      redirect: "follow",
    });
    clearTimeout(timeout);

    const lastModified = response.headers.get("last-modified");
    if (lastModified) {
      return {
        lastUpdated: formatDate(new Date(lastModified)),
        pageTitle: null,
        reachable: response.ok,
      };
    }

    if (!response.ok) {
      return { lastUpdated: null, pageTitle: null, reachable: false };
    }

    const html = await response.text();
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const modifiedMeta =
      html.match(/property="article:modified_time"\s+content="([^"]+)"/i) ??
      html.match(/name="last-modified"\s+content="([^"]+)"/i);

    return {
      lastUpdated: modifiedMeta?.[1]
        ? formatDate(new Date(modifiedMeta[1]))
        : null,
      pageTitle: titleMatch?.[1]?.trim() ?? null,
      reachable: true,
    };
  } catch {
    return { lastUpdated: null, pageTitle: null, reachable: false };
  }
}

function resolveSource(
  apify: Partial<WebsiteStats>,
  measured: Partial<WebsiteStats>,
  ai: Partial<WebsiteStats>,
): WebsiteStatsSource {
  const hasApifyTraffic = Boolean(
    apify.trafficLabel || apify.trafficEstimate,
  );
  const hasApifyMeta = Boolean(apify.websiteAge);
  const hasApify = hasApifyTraffic || hasApifyMeta;
  const hasMeasured = Boolean(
    measured.websiteAge ||
      measured.lastUpdated ||
      (!hasApifyTraffic && (measured.trafficLabel || measured.trafficEstimate)),
  );
  const hasAi = Boolean(
    ai.trafficLabel || ai.trafficEstimate || ai.websiteAge || ai.lastUpdated,
  );

  if (hasApifyTraffic && !hasAi && !hasMeasured) return "apify";
  if (hasApify && (hasAi || hasMeasured)) return "mixed";
  if (hasAi && !hasApify) return "ai";
  if (hasAi && hasMeasured) return "mixed";
  return "measured";
}

function mergeStats(
  apify: Partial<WebsiteStats>,
  measured: Partial<WebsiteStats>,
  ai: Partial<WebsiteStats>,
  apifyConfigured: boolean,
): WebsiteStats {
  const hasApifyTraffic = Boolean(
    apify.trafficLabel || apify.trafficEstimate,
  );

  return {
    trafficLabel: hasApifyTraffic
      ? (apify.trafficLabel ?? null)
      : (measured.trafficLabel ?? ai.trafficLabel ?? null),
    trafficEstimate: hasApifyTraffic
      ? (apify.trafficEstimate ?? null)
      : (measured.trafficEstimate ?? ai.trafficEstimate ?? null),
    websiteAge:
      apify.websiteAge ?? measured.websiteAge ?? ai.websiteAge ?? null,
    lastUpdated:
      apify.lastUpdated ?? measured.lastUpdated ?? ai.lastUpdated ?? null,
    trafficError: apify.trafficError ?? null,
    source:
      apifyConfigured && (hasApifyTraffic || apify.trafficError)
        ? "apify"
        : resolveSource(apify, measured, ai),
  };
}

async function getCachedStats(url: string): Promise<WebsiteStats | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(websiteStatsCache)
    .where(eq(websiteStatsCache.websiteUrl, url))
    .limit(1);

  if (!row) return null;
  const age = Date.now() - row.fetchedAt.getTime();
  if (age > CACHE_TTL_MS) return null;

  const source = (row.source as WebsiteStats["source"]) ?? "measured";
  if (isApifyConfigured() && (source === "ai" || source === "mixed")) {
    return null;
  }

  return {
    trafficLabel: row.trafficLabel,
    trafficEstimate: row.trafficEstimate,
    websiteAge: row.websiteAge,
    lastUpdated: row.lastUpdated,
    source,
    trafficError: null,
  };
}

async function saveCachedStats(url: string, stats: WebsiteStats): Promise<void> {
  const db = getDb();
  await db
    .insert(websiteStatsCache)
    .values({
      websiteUrl: url,
      trafficLabel: stats.trafficLabel,
      trafficEstimate: stats.trafficEstimate,
      websiteAge: stats.websiteAge,
      lastUpdated: stats.lastUpdated,
      source: stats.source,
      rawJson: stats,
    })
    .onConflictDoUpdate({
      target: websiteStatsCache.websiteUrl,
      set: {
        trafficLabel: stats.trafficLabel,
        trafficEstimate: stats.trafficEstimate,
        websiteAge: stats.websiteAge,
        lastUpdated: stats.lastUpdated,
        source: stats.source,
        rawJson: stats,
        fetchedAt: new Date(),
      },
    });
}

export async function getWebsiteStats(
  websiteUrl: string,
  options?: GetWebsiteStatsOptions,
): Promise<WebsiteStats> {
  const url = normalizeUrl(websiteUrl);
  const apifyConfigured = isApifyConfigured();

  if (!options?.bypassCache) {
    const cached = await getCachedStats(url);
    if (cached) return cached;
  }

  const domain = extractDomain(url);

  let apifyPartial: Partial<WebsiteStats> = {};
  let apifyActorNotRented = false;
  if (apifyConfigured) {
    try {
      apifyPartial = await fetchApifyWebsiteStats(url);
    } catch (error) {
      if (error instanceof ApifyActorNotRentedError) {
        apifyActorNotRented = true;
      } else {
        apifyPartial = {
          source: "apify",
          trafficError:
            error instanceof Error ? error.message : "Apify request failed",
        };
      }
    }
  }

  const hasApifyTraffic = Boolean(
    apifyPartial.trafficLabel || apifyPartial.trafficEstimate,
  );

  const [domainAge, pageSignals] = await Promise.all([
    domain && !apifyPartial.websiteAge
      ? fetchRdapDomainAge(domain)
      : Promise.resolve(null),
    fetchPageSignals(url),
  ]);

  const measured: Partial<WebsiteStats> = {
    websiteAge: domainAge,
    lastUpdated: pageSignals.lastUpdated,
    trafficLabel: null,
    trafficEstimate: null,
  };

  const needsTraffic = !hasApifyTraffic;
  const needsAge = !apifyPartial.websiteAge && !measured.websiteAge;
  const needsUpdated =
    !apifyPartial.lastUpdated && !measured.lastUpdated;

  let aiPartial: Partial<WebsiteStats> = {};
  const useAiForTraffic =
    needsTraffic && (!apifyConfigured || apifyActorNotRented);
  const needsAi =
    (useAiForTraffic && needsTraffic) || needsAge || needsUpdated;

  if (needsAi && getAzureOpenAIConfig()) {
    try {
      const aiStats = await estimateWebsiteStats(url, {
        domainAge: apifyPartial.websiteAge ?? domainAge,
        lastUpdated: apifyPartial.lastUpdated ?? pageSignals.lastUpdated,
        pageTitle: pageSignals.pageTitle,
        reachable: pageSignals.reachable,
      });
      if (useAiForTraffic) {
        aiPartial = aiStats;
      } else {
        aiPartial = {
          websiteAge: aiStats.websiteAge,
          lastUpdated: aiStats.lastUpdated,
        };
      }
    } catch {
      // Continue with available data
    }
  }

  const stats = mergeStats(
    apifyPartial,
    measured,
    aiPartial,
    apifyConfigured && hasApifyTraffic,
  );
  await saveCachedStats(url, stats);
  return stats;
}
