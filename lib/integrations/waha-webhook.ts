import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/index";
import {
  users,
  whatsappConversations,
  whatsappMessages,
} from "@/lib/db/schema";
import { processInboundLeadFollowUp } from "@/lib/integrations/inbound-lead-followup";
import { ensureInboundLeadFromReply } from "@/lib/integrations/inbound-lead-create";
import { resolveWahaChatIdToPhone } from "@/lib/integrations/waha";
import { getWhatsAppConfig } from "@/lib/integrations/whatsapp-config";

type WahaMessagePayload = {
  id?: string;
  from?: string;
  to?: string;
  participant?: string;
  fromMe?: boolean;
  body?: string;
  hasMedia?: boolean;
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
): Promise<string | null> {
  for (const chatId of candidateChatIds(payload)) {
    const resolved = await resolveWahaChatIdToPhone(chatId);
    if (resolved) return resolved;
  }
  return null;
}

async function findConversationByStoredChatId(
  chatIds: string[],
  preferredAgentId?: string,
): Promise<(ExistingConversation & { customerPhone: string }) | null> {
  const normalizedIds = chatIds.map(normalizeChatId).filter(Boolean);
  if (normalizedIds.length === 0) return null;

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

export async function handleWahaWebhook(
  body: WahaWebhookBody,
  options?: HandleWahaWebhookOptions,
): Promise<void> {
  const event = body.event?.trim() ?? "";
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
    normalizedFrom = await resolveInboundCustomerPhone(payload);
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

  const conversationPatch = {
    lastMessageAt: now,
    ...(inboundChatId ? { customerChatId: inboundChatId } : {}),
  };

  if (existingConv) {
    conversationId = existingConv.id;
    await db
      .update(whatsappConversations)
      .set(conversationPatch)
      .where(eq(whatsappConversations.id, conversationId));
  } else {
    const [created] = await db
      .insert(whatsappConversations)
      .values({
        agentId,
        customerPhone: normalizedFrom,
        customerChatId: inboundChatId,
        displayName: normalizedFrom,
        lastMessageAt: now,
      })
      .returning({ id: whatsappConversations.id });
    conversationId = created.id;
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
    await processInboundLeadFollowUp({
      conversationId,
      agentId,
      customerPhone: normalizedFrom,
      conversationLeadId,
    });
  }

  await ensureInboundLeadFromReply({
    agentId,
    conversationId,
    customerPhone: normalizedFrom,
    messageBody,
    repliedAt: now,
  });
}
