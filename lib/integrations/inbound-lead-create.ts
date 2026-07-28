import { and, desc, eq, exists } from "drizzle-orm";
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

async function hasOutboundHistoryForPhone(
  agentId: string,
  customerPhone: string,
): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ id: whatsappMessages.id })
    .from(whatsappMessages)
    .innerJoin(
      whatsappConversations,
      eq(whatsappMessages.conversationId, whatsappConversations.id),
    )
    .where(
      and(
        eq(whatsappConversations.agentId, agentId),
        eq(whatsappConversations.customerPhone, customerPhone),
        eq(whatsappMessages.direction, "outbound"),
      ),
    )
    .limit(1);
  return Boolean(row);
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

  if (!outbound) {
    const hasOutboundByPhone = await hasOutboundHistoryForPhone(
      input.agentId,
      input.customerPhone,
    );
    if (!hasOutboundByPhone) return;
  }

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

/** Create or update inbound leads for conversations that already have outbound + inbound messages. */
export async function syncInboundLeadsFromRepliedConversations(
  agentId?: string,
): Promise<void> {
  const db = getDb();

  const outboundExists = exists(
    db
      .select({ id: whatsappMessages.id })
      .from(whatsappMessages)
      .where(
        and(
          eq(whatsappMessages.conversationId, whatsappConversations.id),
          eq(whatsappMessages.direction, "outbound"),
        ),
      ),
  );

  const inboundExists = exists(
    db
      .select({ id: whatsappMessages.id })
      .from(whatsappMessages)
      .where(
        and(
          eq(whatsappMessages.conversationId, whatsappConversations.id),
          eq(whatsappMessages.direction, "inbound"),
        ),
      ),
  );

  const conversations = await db
    .select({
      id: whatsappConversations.id,
      agentId: whatsappConversations.agentId,
      customerPhone: whatsappConversations.customerPhone,
    })
    .from(whatsappConversations)
    .where(
      agentId
        ? and(
            eq(whatsappConversations.agentId, agentId),
            outboundExists,
            inboundExists,
          )
        : and(outboundExists, inboundExists),
    );

  for (const conv of conversations) {
    const [latestInbound] = await db
      .select({
        body: whatsappMessages.body,
        createdAt: whatsappMessages.createdAt,
      })
      .from(whatsappMessages)
      .where(
        and(
          eq(whatsappMessages.conversationId, conv.id),
          eq(whatsappMessages.direction, "inbound"),
        ),
      )
      .orderBy(desc(whatsappMessages.createdAt))
      .limit(1);

    if (!latestInbound) continue;

    await ensureInboundLeadFromReply({
      agentId: conv.agentId,
      conversationId: conv.id,
      customerPhone: conv.customerPhone,
      messageBody: latestInbound.body,
      repliedAt: latestInbound.createdAt,
    });
  }
}
