import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/index";
import {
  users,
  whatsappConversations,
  whatsappMessages,
} from "@/lib/db/schema";
import { processInboundLeadFollowUp } from "@/lib/integrations/inbound-lead-followup";
import { ensureInboundLeadFromReply } from "@/lib/integrations/inbound-lead-create";
import { getWhatsAppConfig } from "@/lib/integrations/whatsapp-config";
import { normalizePhoneForWhatsApp } from "@/lib/whatsapp";

type WahaMessagePayload = {
  id?: string;
  from?: string;
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

function phoneFromChatId(chatId: string): string | null {
  const localPart = chatId.split("@")[0]?.trim() ?? "";
  if (!localPart) return null;
  return normalizePhoneForWhatsApp(localPart) ?? localPart;
}

export function isWahaWebhookPayload(body: unknown): body is WahaWebhookBody {
  if (!body || typeof body !== "object") return false;
  const record = body as Record<string, unknown>;
  return typeof record.event === "string" && "payload" in record;
}

export async function handleWahaWebhook(
  body: WahaWebhookBody,
  options?: HandleWahaWebhookOptions,
): Promise<void> {
  const event = body.event?.trim() ?? "";
  if (event !== "message" && event !== "message.any") return;

  const payload = body.payload;
  if (!payload || payload.fromMe) return;

  const from = payload.from?.trim() ?? "";
  const messageBody = payload.body?.trim() ?? "";
  const waMessageId = payload.id?.trim() ?? null;

  if (!from || !messageBody) return;
  if (payload.hasMedia && !messageBody) return;

  const normalizedFrom = phoneFromChatId(from);
  if (!normalizedFrom) return;

  const { inboundAnalysisSkipRelationship } = getWhatsAppConfig();

  const db = getDb();

  const [existingConv] = await db
    .select({
      id: whatsappConversations.id,
      agentId: whatsappConversations.agentId,
      leadId: whatsappConversations.leadId,
    })
    .from(whatsappConversations)
    .where(eq(whatsappConversations.customerPhone, normalizedFrom))
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
