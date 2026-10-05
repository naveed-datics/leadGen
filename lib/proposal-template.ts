import type { CompetitorWithStats } from "@/lib/types";
import { isPlatformWebsiteUrl } from "@/lib/platform-urls";

export interface ProposalTemplateInput {
  businessName: string;
  industry: string;
  location: string;
  competitors?: CompetitorWithStats[];
  senderName?: string;
  demoUrl?: string;
  customTemplate?: string | null;
}

export const PROPOSAL_PLACEHOLDERS = [
  "{{businessName}}",
  "{{industry}}",
  "{{location}}",
  "{{senderName}}",
  "{{competitorBlock}}",
  "{{demoUrl}}",
] as const;

export const DEFAULT_PROPOSAL_TEMPLATE = `Hi, this is {{senderName}}.

I noticed {{businessName}} doesn't have a website right now.
{{competitorBlock}}
Reply and I'll get a free working demo of your website set up — no payment required.`;

const MAX_COMPETITORS_IN_PROPOSAL = 2;

/** Website name + monthly visitors + last-updated only — no other stats. */
function formatStatsLine(stats: CompetitorWithStats["stats"]): string | null {
  const parts: string[] = [];

  if (stats.trafficEstimate) {
    const visitors = stats.trafficEstimate.replace(/\s*visits?\s*\/\s*mo(?:nth)?\b/i, "").trim();
    parts.push(`${visitors} monthly visitors`);
  }
  if (stats.lastUpdated) parts.push(`updated ${stats.lastUpdated}`);

  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Drops query string and hash (utm params, tracking ids) from a URL. */
function stripQueryParams(url: string): string {
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return trimmed.split(/[?#]/)[0];
  }
}

/** True when the traffic estimate is an explicit zero (e.g. "0 visits/mo"). */
function hasZeroTraffic(stats: CompetitorWithStats["stats"]): boolean {
  const match = stats.trafficEstimate?.match(/\d[\d,]*(?:\.\d+)?/);
  return match ? Number(match[0].replace(/,/g, "")) === 0 : false;
}

function formatCompetitorSection(competitors: CompetitorWithStats[]): string {
  const lines = competitors.map((c) => {
    const statsLine = formatStatsLine(c.stats);
    const base = `- ${stripQueryParams(c.website)}`;
    return statsLine ? `${base} — ${statsLine}` : base;
  });

  return `${lines.join("\n")}\n`;
}

function buildCompetitorBlock(
  competitors: CompetitorWithStats[],
  industry: string,
): string {
  const competitorsForStats = competitors
    .filter((c) => c.website?.trim())
    .filter((c) => !isPlatformWebsiteUrl(c.website))
    .filter((c) => !hasZeroTraffic(c.stats))
    .slice(0, MAX_COMPETITORS_IN_PROPOSAL);

  if (competitorsForStats.length === 0) return "";

  return `\nA couple of nearby ${industry.toLowerCase()} are already online:\n\n${formatCompetitorSection(competitorsForStats)}`;
}

function applyPlaceholders(
  template: string,
  values: Record<string, string>,
): string {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    result = result.split(`{{${key}}}`).join(value);
  }
  return result;
}

export function buildProposalTemplate({
  businessName,
  industry,
  location,
  competitors = [],
  senderName,
  demoUrl,
  customTemplate,
}: ProposalTemplateInput): string {
  const competitorBlock = buildCompetitorBlock(competitors, industry);
  const signature = (senderName ?? "").trim() || "User Name";
  const template =
    customTemplate?.trim() || DEFAULT_PROPOSAL_TEMPLATE;

  return applyPlaceholders(template, {
    businessName,
    industry,
    location,
    senderName: signature,
    competitorBlock,
    demoUrl: demoUrl?.trim() ?? "",
  });
}

export function injectDemoUrl(body: string, demoUrl: string): string {
  if (body.includes("{{demoUrl}}")) {
    return body.replace(/\{\{demoUrl\}\}/g, demoUrl);
  }
  return `${body.trim()}\n\nPreview your demo site: ${demoUrl}`;
}

export const SAMPLE_PROPOSAL_PREVIEW = {
  businessName: "Sample Bakery",
  industry: "Restaurants",
  location: "Austin, TX",
  senderName: "Your Name",
  demoUrl: "https://example.com/demo/sample-bakery",
  competitors: [] as CompetitorWithStats[],
};
