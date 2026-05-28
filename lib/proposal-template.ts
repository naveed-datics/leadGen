import type { CompetitorWithStats } from "@/lib/types";

export interface ProposalTemplateInput {
  businessName: string;
  industry: string;
  location: string;
  competitors?: CompetitorWithStats[];
  senderName?: string;
}

function isSocialWebsiteUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    const host = hostname.toLowerCase().replace(/^www\./, "");
    const socialHosts = new Set([
      "facebook.com",
      "fb.com",
      "instagram.com",
      "tiktok.com",
      "twitter.com",
      "x.com",
      "linkedin.com",
      "youtube.com",
      "youtu.be",
      "pinterest.com",
      "snapchat.com",
      "telegram.me",
      "t.me",
      "whatsapp.com",
      "wa.me",
    ]);
    return socialHosts.has(host);
  } catch {
    // If URL parsing fails, treat it as non-social so we don't accidentally drop real sites.
    return false;
  }
}

function formatStatsLine(stats: CompetitorWithStats["stats"]): string | null {
  const parts: string[] = [];

  const traffic =
    stats.trafficLabel && stats.trafficEstimate
      ? `${stats.trafficLabel} (${stats.trafficEstimate})`
      : stats.trafficLabel ?? stats.trafficEstimate;
  if (traffic) parts.push(`Traffic: ${traffic}`);

  if (stats.lastUpdated) parts.push(`Updated ${stats.lastUpdated}`);

  return parts.length > 0 ? parts.join(" · ") : null;
}

function formatCompetitorSection(
  competitors: CompetitorWithStats[],
): string {
  const lines = competitors.map((c, i) => {
    const statsLine = formatStatsLine(c.stats);
    const numberEmoji = ["1️⃣", "2️⃣", "3️⃣"][i] ?? `${i + 1}.`;
    const base = `${numberEmoji} *${c.title}*\nWebsite: ${c.website}`;
    return statsLine ? `${base}\n${statsLine}` : base;
  });

  return `${lines.join("\n\n")}\n`;
}

export function buildProposalTemplate({
  businessName,
  industry,
  location,
  competitors = [],
  senderName,
}: ProposalTemplateInput): string {
  const competitorsForStats = competitors
    .filter((c) => c.website?.trim())
    .filter((c) => !isSocialWebsiteUrl(c.website))
    .slice(0, 3);

  const competitorBlock =
    competitorsForStats.length > 0
      ? `Let me share some stats 👇\n\n${formatCompetitorSection(competitorsForStats)}`
      : "";

  const signature = (senderName ?? "").trim() || "User Name";

  return `Hi ${businessName} Team! 👋

I came across your business profile on Google — really impressive ratings! ⭐

But I noticed you don't have a website yet, which is essential in today's digital world. Your nearby competitors already have websites and are getting customers online.
${competitorBlock ? `\n\n${competitorBlock}` : ""}

It's the right time to come online with a website and start getting potential clients. 🚀

Let's have a quick call — after that, we'll create a *demo website* and finalize it based on your feedback. 😊

${signature},`;
}
