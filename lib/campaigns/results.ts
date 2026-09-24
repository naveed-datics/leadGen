import { eq, sql } from "drizzle-orm";
import type { getDb } from "@/lib/db/index";
import { campaignBusinesses, leads, proposals, searchBusinesses } from "@/lib/db/schema";

export type CampaignResults = {
  businessCount: number;
  leadsCreated: number;
  demosBuilt: number;
  proposalsCreated: number;
  proposalsSent: number;
  proposalsDelivered: number;
  proposalsRead: number;
  proposalsReplied: number;
};

/** Demo/proposal/WhatsApp funnel for one campaign's businesses, computed live. */
export async function computeCampaignResults(
  db: ReturnType<typeof getDb>,
  campaignId: string,
): Promise<CampaignResults> {
  const [row] = await db
    .select({
      businessCount: sql<number>`count(distinct ${campaignBusinesses.id})`,
      leadsCreated: sql<number>`count(distinct ${leads.id})`,
      demosBuilt: sql<number>`count(distinct case when ${proposals.demoStatus} = 'ready' then ${proposals.id} end)`,
      proposalsCreated: sql<number>`count(distinct ${proposals.id})`,
      proposalsSent: sql<number>`count(distinct case when ${proposals.status} in ('sent', 'replied') then ${proposals.id} end)`,
      proposalsDelivered: sql<number>`count(distinct case when ${proposals.deliveredAt} is not null then ${proposals.id} end)`,
      proposalsRead: sql<number>`count(distinct case when ${proposals.readAt} is not null then ${proposals.id} end)`,
      proposalsReplied: sql<number>`count(distinct case when ${proposals.status} = 'replied' then ${proposals.id} end)`,
    })
    .from(campaignBusinesses)
    .innerJoin(
      searchBusinesses,
      eq(campaignBusinesses.searchBusinessId, searchBusinesses.id),
    )
    .leftJoin(leads, eq(leads.searchBusinessId, searchBusinesses.id))
    .leftJoin(proposals, eq(proposals.leadId, leads.id))
    .where(eq(campaignBusinesses.campaignId, campaignId))
    .limit(1);

  return {
    businessCount: Number(row?.businessCount ?? 0),
    leadsCreated: Number(row?.leadsCreated ?? 0),
    demosBuilt: Number(row?.demosBuilt ?? 0),
    proposalsCreated: Number(row?.proposalsCreated ?? 0),
    proposalsSent: Number(row?.proposalsSent ?? 0),
    proposalsDelivered: Number(row?.proposalsDelivered ?? 0),
    proposalsRead: Number(row?.proposalsRead ?? 0),
    proposalsReplied: Number(row?.proposalsReplied ?? 0),
  };
}
