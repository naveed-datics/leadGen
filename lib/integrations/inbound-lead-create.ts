import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/index";
import {
  inboundLeads,
  leads,
  searches,
  whatsappConversations,
  whatsappMessages,
} from "@/lib/db/schema";
import { normalizePhoneForWhatsApp } from "@/lib/whatsapp";

export type InboundLeadReplyInput = {
  agentId: string;
  conversationId: string;
  customerPhone: string;
  messageBody: string;
  repliedAt: Date;
};

function phonesMatch(storedPhone: string | null, normalizedCustomerPhone: string): boolean {
  if (!storedPhone?.trim()) return false;
  const normalized = normalizePhoneForWhatsApp(storedPhone);
  return normalized === normalizedCustomerPhone;
}

async function searchLeadExistsForPhone(
  agentId: string,
  customerPhone: string,
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ phone: leads.phone })
    .from(leads)
    .innerJoin(searches, eq(leads.searchId, searches.id))
    .where(eq(searches.agentId, agentId));

  return rows.some((row) => phonesMatch(row.phone, customerPhone));
}

export async function ensureInboundLeadFromReply(
  input: InboundLeadReplyInput,
): Promise<void> {
  const db = getDb();

  const [outbound] = await db
    .select({ id: whatsappMessages.id })
    .from(whatsappMessages)
    .where(
      and(
        eq(whatsappMessages.conversationId, input.conversationId),
        eq(whatsappMessages.direction, "outbound"),
      ),
    )
    .limit(1);

  if (!outbound) return;

  if (await searchLeadExistsForPhone(input.agentId, input.customerPhone)) {
    return;
  }

  const [conv] = await db
    .select({
      displayName: whatsappConversations.displayName,
      industry: whatsappConversations.industry,
    })
    .from(whatsappConversations)
    .where(eq(whatsappConversations.id, input.conversationId))
    .limit(1);

  const businessName = conv?.displayName?.trim() || input.customerPhone;
  const industry = conv?.industry ?? null;

  const [existing] = await db
    .select({ id: inboundLeads.id })
    .from(inboundLeads)
    .where(
      and(
        eq(inboundLeads.agentId, input.agentId),
        eq(inboundLeads.phone, input.customerPhone),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(inboundLeads)
      .set({
        conversationId: input.conversationId,
        businessName,
        industry,
        lastReplyAt: input.repliedAt,
        lastReplyBody: input.messageBody,
      })
      .where(eq(inboundLeads.id, existing.id));
    return;
  }

  await db.insert(inboundLeads).values({
    agentId: input.agentId,
    conversationId: input.conversationId,
    businessName,
    phone: input.customerPhone,
    industry,
    firstReplyAt: input.repliedAt,
    lastReplyAt: input.repliedAt,
    lastReplyBody: input.messageBody,
  });
}
