import type { CompetitorWithStats } from "@/lib/types";

export interface ProposalTemplateInput {
  businessName: string;
  industry: string;
  location: string;
  competitors?: CompetitorWithStats[];
}

function formatStatsLine(stats: CompetitorWithStats["stats"]): string | null {
  const parts: string[] = [];
  const traffic =
    stats.trafficLabel && stats.trafficEstimate
      ? `${stats.trafficLabel} (${stats.trafficEstimate})`
      : stats.trafficLabel ?? stats.trafficEstimate;
  if (traffic) parts.push(`Traffic: ${traffic}`);
  if (stats.lastUpdated) parts.push(`Last updated: ${stats.lastUpdated}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function formatCompetitorSection(
  industry: string,
  location: string,
  competitors: CompetitorWithStats[],
): string {
  const lines = competitors.map((c, i) => {
    const statsLine = formatStatsLine(c.stats);
    const base = `${i + 1}. ${c.title}\n   Website: ${c.website}`;
    return statsLine ? `${base}\n   ${statsLine}` : base;
  });

  return `Nearby ${industry} in ${location} already have a website and are reaching customers online:

${lines.join("\n\n")}

`;
}

export function buildProposalTemplate({
  businessName,
  industry,
  location,
  competitors = [],
}: ProposalTemplateInput): string {
  const competitorBlock =
    competitors.length > 0
      ? formatCompetitorSection(industry, location, competitors)
      : "";

  const competitorPitch =
    competitors.length > 0
      ? "Without a website, you may be losing customers to these businesses. "
      : "";

  return `Hi ${businessName},

We noticed ${businessName} in ${location} may not have a website yet. ${competitorBlock}${competitorPitch}We help ${industry} businesses get online with a professional site that brings in more customers.

Would you be open to a quick 10-minute call this week to see if we are a good fit?

Best regards,
Your Name
Your Company`;
}
