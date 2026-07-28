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

/** Match WAHA chat id to a phone we already messaged (handles @lid lookup failures). */
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

  const normalizedChatId = trimmed.toLowerCase();
  for (const row of rows) {
    const phone = row.customerPhone.trim();
    if (!phone) continue;
    const candidates = [`${phone}@c.us`, `${phone}@s.whatsapp.net`].map((value) =>
      value.toLowerCase(),
    );
    if (candidates.includes(normalizedChatId)) {
      return phone;
    }
  }
  return null;
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

  let normalizedFrom = await resolveInboundCustomerPhone(payload);
  if (!normalizedFrom && options?.agentId) {
    for (const chatId of candidateChatIds(payload)) {
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
  if (!normalizedFrom) return;

  const { inboundAnalysisSkipRelationship } = getWhatsAppConfig();

  const db = getDb();

  const agentClause = options?.agentId
    ? eq(whatsappConversations.agentId, options.agentId)
    : undefined;

  const [existingConv] = await db
    .select({
      id: whatsappConversations.id,
      agentId: whatsappConversations.agentId,
      leadId: whatsappConversations.leadId,
    })
    .from(whatsappConversations)
    .where(
      agentClause
        ? and(eq(whatsappConversations.customerPhone, normalizedFrom), agentClause)
        : eq(whatsappConversations.customerPhone, normalizedFrom),
    )
    .orderBy(desc(whatsappConversations.lastMessageAt))
    .limit(1);

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
    await db
      .update(whatsappConversations)
      .set({ lastMessageAt: now })
      .where(eq(whatsappConversations.id, conversationId));
  } else {
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
