import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "@/lib/db/index";
import {
  leads,
  proposalFollowUps,
  proposals,
  searches,
  whatsappConversations,
  whatsappMessages,
} from "@/lib/db/schema";
import {
  buildFollowUpDay3Message,
  buildFollowUpDay7Message,
} from "@/lib/follow-up-template";
import { getTopCompetitorForLead } from "@/lib/lead-competitor";
import {
  sendWhatsAppMessageToLead,
  WhatsAppSendError,
} from "@/lib/integrations/send-whatsapp-message";
import { PROPOSAL_STATUS_SENT } from "@/lib/proposal-status";
import {
  FOLLOW_UP_DAY3_MS,
  FOLLOW_UP_DAY7_MS,
  isProposalFollowUpsEnabled,
} from "@/lib/proposal-follow-up-config";

export type FollowUpStatus = "pending" | "sent" | "cancelled" | "failed";

export type ProcessDueFollowUpsResult = {
  processed: number;
  sent: number;
  cancelled: number;
  failed: number;
};

async function hasInboundReplySinceSend(
  leadId: string,
  sentAt: Date,
): Promise<boolean> {
  const db = getDb();
  const [conv] = await db
    .select({ id: whatsappConversations.id })
    .from(whatsappConversations)
    .where(eq(whatsappConversations.leadId, leadId))
    .limit(1);

  if (!conv) return false;

  const [inbound] = await db
    .select({ id: whatsappMessages.id })
    .from(whatsappMessages)
    .where(
      and(
        eq(whatsappMessages.conversationId, conv.id),
        eq(whatsappMessages.direction, "inbound"),
        gte(whatsappMessages.createdAt, sentAt),
      ),
    )
    .limit(1);

  return Boolean(inbound);
}

export async function scheduleProposalFollowUps(
  proposalId: string,
  sentAt: Date,
): Promise<void> {
  if (!isProposalFollowUpsEnabled()) return;

  const db = getDb();

  const [row] = await db
    .select({
      leadId: proposals.leadId,
      demoUrl: proposals.demoUrl,
      businessName: leads.title,
    })
    .from(proposals)
    .innerJoin(leads, eq(proposals.leadId, leads.id))
    .where(eq(proposals.id, proposalId))
    .limit(1);

  if (!row) return;

  const competitor = await getTopCompetitorForLead(row.leadId);
  const day3Body = buildFollowUpDay3Message({
    businessName: row.businessName,
    demoUrl: row.demoUrl,
  });
  const day7Body = buildFollowUpDay7Message({
    businessName: row.businessName,
    demoUrl: row.demoUrl,
    competitorName: competitor?.title ?? null,
    competitorUrl: competitor?.website ?? null,
  });

  const rows: {
    proposalId: string;
    step: number;
    scheduledAt: Date;
    status: FollowUpStatus;
    body: string;
    error?: string;
  }[] = [
    {
      proposalId,
      step: 1,
      scheduledAt: new Date(sentAt.getTime() + FOLLOW_UP_DAY3_MS),
      status: "pending",
      body: day3Body,
    },
  ];

  if (day7Body) {
    rows.push({
      proposalId,
      step: 2,
      scheduledAt: new Date(sentAt.getTime() + FOLLOW_UP_DAY7_MS),
      status: "pending",
      body: day7Body,
    });
  } else {
    rows.push({
      proposalId,
      step: 2,
      scheduledAt: new Date(sentAt.getTime() + FOLLOW_UP_DAY7_MS),
      status: "cancelled",
      body: "",
      error: "No competitor with website available for Day 7 follow-up",
    });
  }

  await db.insert(proposalFollowUps).values(rows).onConflictDoNothing();
}

export async function cancelProposalFollowUps(
  proposalId: string,
  reason?: string,
): Promise<void> {
  const db = getDb();
  await db
    .update(proposalFollowUps)
    .set({
      status: "cancelled",
      error: reason ?? null,
    })
    .where(
      and(
        eq(proposalFollowUps.proposalId, proposalId),
        eq(proposalFollowUps.status, "pending"),
      ),
    );
}

export async function processDueFollowUps(): Promise<ProcessDueFollowUpsResult> {
  const result: ProcessDueFollowUpsResult = {
    processed: 0,
    sent: 0,
    cancelled: 0,
    failed: 0,
  };

  if (!isProposalFollowUpsEnabled()) return result;

  const db = getDb();
  const now = new Date();

  const dueRows = await db
    .select({
      followUpId: proposalFollowUps.id,
      step: proposalFollowUps.step,
      body: proposalFollowUps.body,
      proposalId: proposals.id,
      proposalStatus: proposals.status,
      repliedAt: proposals.repliedAt,
      sentAt: proposals.sentAt,
      leadId: leads.id,
      agentId: searches.agentId,
    })
    .from(proposalFollowUps)
    .innerJoin(proposals, eq(proposalFollowUps.proposalId, proposals.id))
    .innerJoin(leads, eq(proposals.leadId, leads.id))
    .innerJoin(searches, eq(leads.searchId, searches.id))
    .where(
      and(
        eq(proposalFollowUps.status, "pending"),
        lte(proposalFollowUps.scheduledAt, now),
      ),
    );

  for (const row of dueRows) {
    result.processed += 1;

    if (
      row.proposalStatus !== PROPOSAL_STATUS_SENT ||
      row.repliedAt != null ||
      !row.sentAt ||
      !row.agentId
    ) {
      await db
        .update(proposalFollowUps)
        .set({
          status: "cancelled",
          error: "Proposal no longer eligible for follow-up",
        })
        .where(eq(proposalFollowUps.id, row.followUpId));
      result.cancelled += 1;
      continue;
    }

    const replied = await hasInboundReplySinceSend(row.leadId, row.sentAt);
    if (replied) {
      await cancelProposalFollowUps(row.proposalId, "Lead replied");
      result.cancelled += 1;
      continue;
    }

    try {
      await sendWhatsAppMessageToLead({
        leadId: row.leadId,
        agentId: row.agentId,
        body: row.body,
        kind: "follow_up",
      });

      await db
        .update(proposalFollowUps)
        .set({
          status: "sent",
          sentAt: new Date(),
          error: null,
        })
        .where(eq(proposalFollowUps.id, row.followUpId));
      result.sent += 1;
    } catch (error) {
      const message =
        error instanceof WhatsAppSendError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Failed to send follow-up";

      await db
        .update(proposalFollowUps)
        .set({
          status: "failed",
          error: message,
        })
        .where(eq(proposalFollowUps.id, row.followUpId));
      result.failed += 1;
    }
  }

  return result;
}

export async function getFollowUpsForProposals(proposalIds: string[]) {
  if (proposalIds.length === 0) return new Map<string, FollowUpRow[]>();

  const db = getDb();
  const rows = await db
    .select({
      proposalId: proposalFollowUps.proposalId,
      step: proposalFollowUps.step,
      status: proposalFollowUps.status,
      scheduledAt: proposalFollowUps.scheduledAt,
      sentAt: proposalFollowUps.sentAt,
    })
    .from(proposalFollowUps)
    .where(inArray(proposalFollowUps.proposalId, proposalIds))
    .orderBy(proposalFollowUps.step);

  const map = new Map<string, FollowUpRow[]>();
  for (const row of rows) {
    const existing = map.get(row.proposalId) ?? [];
    existing.push({
      step: row.step,
      status: row.status as FollowUpStatus,
      scheduledAt: row.scheduledAt.toISOString(),
      sentAt: row.sentAt?.toISOString() ?? null,
    });
    map.set(row.proposalId, existing);
  }
  return map;
}

export type FollowUpRow = {
  step: number;
  status: FollowUpStatus;
  scheduledAt: string;
  sentAt: string | null;
};

export function formatFollowUpStatus(followUps: FollowUpRow[]): string | null {
  if (followUps.length === 0) return null;

  const pending = followUps.filter((f) => f.status === "pending");
  const allCancelled = followUps.every((f) => f.status === "cancelled");
  const step2Sent = followUps.some((f) => f.step === 2 && f.status === "sent");
  const step1Sent = followUps.some((f) => f.step === 1 && f.status === "sent");

  if (allCancelled) {
    const repliedCancel = followUps.some((f) =>
      f.status === "cancelled",
    );
    return repliedCancel ? "Follow-ups cancelled (replied)" : "Follow-ups cancelled";
  }

  if (step2Sent || (step1Sent && pending.length === 0)) {
    return "Follow-up sequence complete";
  }

  if (step1Sent) {
    const day7 = pending.find((f) => f.step === 2);
    return day7 ? "Day 3 sent · Day 7 scheduled" : "Day 3 sent";
  }

  const day3 = pending.find((f) => f.step === 1);
  if (day3) return "Day 3 follow-up scheduled";

  return null;
}
