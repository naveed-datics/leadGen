import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/index";
import {
  leads,
  proposals,
  searches,
  whatsappConversations,
} from "@/lib/db/schema";
import { PROPOSAL_STATUS_REPLIED, PROPOSAL_STATUS_SENT } from "@/lib/proposal-status";
import { cancelProposalFollowUps } from "@/lib/proposal-follow-up-sequence";
import { normalizePhoneForWhatsApp } from "@/lib/whatsapp";

export type InboundFollowUpInput = {
  conversationId: string;
  agentId: string;
  customerPhone: string;
  conversationLeadId: string | null;
};

function phonesMatch(storedPhone: string | null, normalizedCustomerPhone: string): boolean {
  if (!storedPhone?.trim()) return false;
  const normalized = normalizePhoneForWhatsApp(storedPhone);
  return normalized === normalizedCustomerPhone;
}

async function findLeadBySentProposal(
  agentId: string,
  customerPhone: string,
): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .select({
      leadId: leads.id,
      phone: leads.phone,
    })
    .from(leads)
    .innerJoin(searches, eq(leads.searchId, searches.id))
    .innerJoin(proposals, eq(proposals.leadId, leads.id))
    .where(
      and(
        eq(searches.agentId, agentId),
        eq(proposals.status, PROPOSAL_STATUS_SENT),
        isNull(proposals.repliedAt),
      ),
    );

  const match = rows.find((row) => phonesMatch(row.phone, customerPhone));
  return match?.leadId ?? null;
}

async function findLeadByPhone(agentId: string, customerPhone: string): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .select({
      leadId: leads.id,
      phone: leads.phone,
    })
    .from(leads)
    .innerJoin(searches, eq(leads.searchId, searches.id))
    .where(eq(searches.agentId, agentId));

  const match = rows.find((row) => phonesMatch(row.phone, customerPhone));
  return match?.leadId ?? null;
}

export async function processInboundLeadFollowUp(
  input: InboundFollowUpInput,
): Promise<void> {
  const db = getDb();
  let leadId = input.conversationLeadId;

  if (!leadId) {
    leadId = await findLeadBySentProposal(input.agentId, input.customerPhone);
    if (leadId) {
      await db
        .update(whatsappConversations)
        .set({ leadId })
        .where(eq(whatsappConversations.id, input.conversationId));
    } else {
      const fallbackLeadId = await findLeadByPhone(input.agentId, input.customerPhone);
      if (fallbackLeadId) {
        await db
          .update(whatsappConversations)
          .set({ leadId: fallbackLeadId })
          .where(eq(whatsappConversations.id, input.conversationId));
      }
      return;
    }
  }

  const [proposal] = await db
    .select({ id: proposals.id, status: proposals.status })
    .from(proposals)
    .where(eq(proposals.leadId, leadId))
    .limit(1);

  if (!proposal) return;
  if (proposal.status === PROPOSAL_STATUS_REPLIED) return;
  if (proposal.status !== PROPOSAL_STATUS_SENT) return;

  const now = new Date();
  await db
    .update(proposals)
    .set({
      status: PROPOSAL_STATUS_REPLIED,
      repliedAt: now,
      updatedAt: now,
    })
    .where(eq(proposals.id, proposal.id));

  await cancelProposalFollowUps(proposal.id, "Lead replied");
}
