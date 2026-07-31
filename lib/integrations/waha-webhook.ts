import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/index";
import {
  users,
  whatsappConversations,
  whatsappMessages,
} from "@/lib/db/schema";
import { processInboundLeadFollowUp } from "@/lib/integrations/inbound-lead-followup";
import { ensureInboundLeadFromReply } from "@/lib/integrations/inbound-lead-create";
import { handleWahaMessageAck } from "@/lib/integrations/waha-message-ack";
import { resolveWahaChatIdToPhone, getWahaConfigForAgent, isWahaConfigured } from "@/lib/integrations/waha";
import { getWhatsAppConfig } from "@/lib/integrations/whatsapp-config";
import {
  hasCustomerChatIdColumn,
  optionalCustomerChatId,
} from "@/lib/integrations/customer-chat-id-column";
import { normalizePhoneForWhatsApp } from "@/lib/whatsapp";

type WahaMessagePayload = {
  id?: string;
  from?: string;
  to?: string;
  participant?: string;
  fromMe?: boolean;
  body?: string;
  hasMedia?: boolean;
  ack?: number;
  ackName?: string;
};

export type WahaWebhookBody = {
  event?: string;
  session?: string;
  payload?: WahaMessagePayload;
};

export type HandleWahaWebhookOptions = {
  agentId?: string;
};

type ExistingConversation = {
  id: string;
  agentId: string;
  leadId: string | null;
};

function extractMessageBody(payload: WahaMessagePayload): string {
  const body = payload.body?.trim() ?? "";
  if (body) return body;
  if (payload.hasMedia) return "[media]";
  return "";
}

function candidateChatIds(payload: WahaMessagePayload): string[] {
  const ids = [payload.from, payload.participant, payload.to]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean);
  return [...new Set(ids)];
}

function normalizeChatId(chatId: string): string {
  return chatId.trim().toLowerCase();
}

export function isWahaWebhookPayload(body: unknown): body is WahaWebhookBody {
  if (!body || typeof body !== "object") return false;
  const record = body as Record<string, unknown>;
  return typeof record.event === "string" && "payload" in record;
}

async function resolveInboundCustomerPhone(
  payload: WahaMessagePayload,
  agentId?: string,
): Promise<string | null> {
  const wahaConfig =
    agentId && isWahaConfigured() ? getWahaConfigForAgent(agentId) : null;

  for (const chatId of candidateChatIds(payload)) {
    try {
      if (!wahaConfig) {
        const [localPart, suffix = ""] = chatId.trim().split("@");
        if (!localPart) continue;
        if (suffix === "c.us" || suffix === "s.whatsapp.net") {
          const resolved = normalizePhoneForWhatsApp(localPart);
          if (resolved) return resolved;
        }
        continue;
      }
      const resolved = await resolveWahaChatIdToPhone(wahaConfig, chatId);
      if (resolved) return resolved;
    } catch (error) {
      console.warn("[waha-webhook] LID/phone resolve failed:", chatId, error);
    }
  }
  return null;
}

async function findConversationByStoredChatId(
  chatIds: string[],
  preferredAgentId?: string,
): Promise<(ExistingConversation & { customerPhone: string }) | null> {
  try {
    if (!(await hasCustomerChatIdColumn())) {
      return null;
    }
  } catch {
    return null;
  }

  const normalizedIds = chatIds.map(normalizeChatId).filter(Boolean);
  if (normalizedIds.length === 0) return null;

  try {
    const db = getDb();
    const rows = await db
      .select({
        id: whatsappConversations.id,
        agentId: whatsappConversations.agentId,
        leadId: whatsappConversations.leadId,
        customerPhone: whatsappConversations.customerPhone,
        customerChatId: whatsappConversations.customerChatId,
      })
      .from(whatsappConversations)
      .where(
        preferredAgentId
          ? eq(whatsappConversations.agentId, preferredAgentId)
          : undefined,
      )
      .orderBy(desc(whatsappConversations.lastMessageAt))
      .limit(500);

    for (const row of rows) {
      const stored = row.customerChatId?.trim();
      if (!stored) continue;
      if (normalizedIds.includes(normalizeChatId(stored))) {
        return {
          id: row.id,
          agentId: row.agentId,
          leadId: row.leadId,
          customerPhone: row.customerPhone,
        };
      }
    }
  } catch (error) {
    console.warn("[waha-webhook] findConversationByStoredChatId failed:", error);
  }
  return null;
}

/** Match WAHA chat id to a phone we already messaged (legacy @c.us conversations). */
async function resolvePhoneFromKnownConversations(
  agentId: string,
  chatId: string,
): Promise<string | null> {
  const trimmed = chatId.trim();
  if (!trimmed) return null;

  const db = getDb();
  const rows = await db
    .select({ customerPhone: whatsappConversations.customerPhone })
    .from(whatsappConversations)
    .where(eq(whatsappConversations.agentId, agentId));

  const normalizedChatId = normalizeChatId(trimmed);
  for (const row of rows) {
    const phone = row.customerPhone.trim();
    if (!phone) continue;
    const candidates = [`${phone}@c.us`, `${phone}@s.whatsapp.net`].map(normalizeChatId);
    if (candidates.includes(normalizedChatId)) {
      return phone;
    }
  }
  return null;
}

async function findConversationByPhone(
  normalizedPhone: string,
  preferredAgentId?: string,
): Promise<ExistingConversation | null> {
  const db = getDb();
  const [row] = await db
    .select({
      id: whatsappConversations.id,
      agentId: whatsappConversations.agentId,
      leadId: whatsappConversations.leadId,
    })
    .from(whatsappConversations)
    .where(
      preferredAgentId
        ? and(
            eq(whatsappConversations.customerPhone, normalizedPhone),
            eq(whatsappConversations.agentId, preferredAgentId),
          )
        : eq(whatsappConversations.customerPhone, normalizedPhone),
    )
    .orderBy(desc(whatsappConversations.lastMessageAt))
    .limit(1);

  return row ?? null;
}

async function touchConversation(
  conversationId: string,
  inboundChatId: string | null,
): Promise<void> {
  const db = getDb();
  const now = new Date();

  // Always bump lastMessageAt first — never block inbound message insert on chat-id column issues.
  await db
    .update(whatsappConversations)
    .set({ lastMessageAt: now })
    .where(eq(whatsappConversations.id, conversationId));

  const chatIdFields = await optionalCustomerChatId(inboundChatId);
  if (!chatIdFields.customerChatId) return;

  try {
    await db
      .update(whatsappConversations)
      .set(chatIdFields)
      .where(eq(whatsappConversations.id, conversationId));
  } catch (error) {
    console.warn("[waha-webhook] failed to store customer_chat_id:", error);
  }
}

export async function handleWahaWebhook(
  body: WahaWebhookBody,
  options?: HandleWahaWebhookOptions,
): Promise<void> {
  const event = body.event?.trim() ?? "";

  if (event === "message.ack") {
    try {
      await handleWahaMessageAck(body.payload);
    } catch (error) {
      console.warn("[waha-webhook] message.ack handling failed:", error);
    }
    return;
  }

  if (event !== "message" && event !== "message.any") return;

  const payload = body.payload;
  if (!payload || payload.fromMe) return;

  const messageBody = extractMessageBody(payload);
  const waMessageId = payload.id?.trim() ?? null;

  if (!messageBody) return;

  const chatIds = candidateChatIds(payload);
  const inboundChatId = payload.from?.trim() || chatIds[0] || null;

  let normalizedFrom: string | null = null;
  let existingConv: ExistingConversation | null = null;

  const byStoredChatId = await findConversationByStoredChatId(
    chatIds,
    options?.agentId,
  );
  if (byStoredChatId) {
    normalizedFrom = byStoredChatId.customerPhone;
    existingConv = {
      id: byStoredChatId.id,
      agentId: byStoredChatId.agentId,
      leadId: byStoredChatId.leadId,
    };
  }

  if (!normalizedFrom) {
    normalizedFrom = await resolveInboundCustomerPhone(
      payload,
      options?.agentId,
    );
  }

  if (!normalizedFrom && options?.agentId) {
    for (const chatId of chatIds) {
      const fromHistory = await resolvePhoneFromKnownConversations(
        options.agentId,
        chatId,
      );
      if (fromHistory) {
        normalizedFrom = fromHistory;
        break;
      }
    }
  }

  // Last resort: if we only have an @lid and agentId, still attach to the most
  // recent outbound conversation for this agent when there is exactly one recent match attempt via chat id store failed.
  if (!normalizedFrom) {
    console.warn("[waha-webhook] dropped inbound: could not resolve sender phone", {
      chatIds,
      agentId: options?.agentId ?? null,
    });
    return;
  }

  if (!existingConv) {
    existingConv = await findConversationByPhone(normalizedFrom, options?.agentId);
  }

  const { inboundAnalysisSkipRelationship } = getWhatsAppConfig();

  const db = getDb();

  let agentId: string | null = existingConv?.agentId ?? options?.agentId ?? null;
  if (!agentId) {
    const [agent] = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.role, "agent"),
          eq(users.active, true),
          eq(users.whatsAppEnabled, true),
        ),
      )
      .limit(1);
    agentId = agent?.id ?? null;
  }

  if (!agentId) return;

  const now = new Date();
  let conversationId: string;
  const conversationLeadId: string | null = existingConv?.leadId ?? null;

  if (existingConv) {
    conversationId = existingConv.id;
    await touchConversation(conversationId, inboundChatId);
  } else {
    const chatIdFields = await optionalCustomerChatId(inboundChatId);
    try {
      const [created] = await db
        .insert(whatsappConversations)
        .values({
          agentId,
          customerPhone: normalizedFrom,
          displayName: normalizedFrom,
          lastMessageAt: now,
          ...chatIdFields,
        })
        .returning({ id: whatsappConversations.id });
      conversationId = created.id;
    } catch (error) {
      // Retry without customer_chat_id if the column is missing on this DB.
      console.warn("[waha-webhook] insert with chat id failed, retrying plain:", error);
      const [created] = await db
        .insert(whatsappConversations)
        .values({
          agentId,
          customerPhone: normalizedFrom,
          displayName: normalizedFrom,
          lastMessageAt: now,
        })
        .returning({ id: whatsappConversations.id });
      conversationId = created.id;
    }
  }

  if (waMessageId) {
    const [dupe] = await db
      .select({ id: whatsappMessages.id })
      .from(whatsappMessages)
      .where(eq(whatsappMessages.waMessageId, waMessageId))
      .limit(1);
    if (dupe) return;
  }

  await db.insert(whatsappMessages).values({
    conversationId,
    direction: "inbound",
    body: messageBody,
    waMessageId,
    status: "received",
    createdAt: now,
  });

  if (!inboundAnalysisSkipRelationship) {
    try {
      await processInboundLeadFollowUp({
        conversationId,
        agentId,
        customerPhone: normalizedFrom,
        conversationLeadId,
      });
    } catch (error) {
      console.warn("[waha-webhook] follow-up processing failed:", error);
    }
  }

  try {
    await ensureInboundLeadFromReply({
      agentId,
      conversationId,
      customerPhone: normalizedFrom,
      messageBody,
      repliedAt: now,
    });
  } catch (error) {
    console.warn("[waha-webhook] inbound lead create failed:", error);
  }
}
