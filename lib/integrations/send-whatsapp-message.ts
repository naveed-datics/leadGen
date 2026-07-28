import { and, desc, eq, gte } from "drizzle-orm";
import { getDb } from "@/lib/db/index";
import { leads, searches, whatsappConversations, whatsappMessages } from "@/lib/db/schema";
import {
  checkWahaContactExists,
  sendWahaTextMessage,
} from "@/lib/integrations/waha";
import { getWhatsAppConfig } from "@/lib/integrations/whatsapp-config";
import { normalizePhoneForWhatsApp } from "@/lib/whatsapp";

export type WhatsAppSendKind = "proposal" | "follow_up";

export type SendWhatsAppMessageInput = {
  leadId: string;
  agentId: string;
  body: string;
  kind: WhatsAppSendKind;
  /** When set, sends to this number instead of the lead's phone and skips
   * qualification/dedupe/throttle checks and conversation logging. Used for
   * test-mode sends that must not affect the lead's real proposal state. */
  overridePhone?: string;
};

export type SendWhatsAppMessageResult = {
  conversationId: string;
  waMessageId: string | null;
};

export class WhatsAppSendError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "WhatsAppSendError";
  }
}

export async function sendWhatsAppMessageToLead(
  input: SendWhatsAppMessageInput,
): Promise<SendWhatsAppMessageResult> {
  const db = getDb();
  const config = getWhatsAppConfig();
  const proposalBody = input.body.trim();

  if (!proposalBody) {
    throw new WhatsAppSendError("Message body is required", 400);
  }

  const [lead] = await db
    .select({
      id: leads.id,
      phone: leads.phone,
      hasWhatsapp: leads.hasWhatsapp,
      title: leads.title,
      industry: searches.industry,
    })
    .from(leads)
    .innerJoin(searches, eq(leads.searchId, searches.id))
    .where(eq(leads.id, input.leadId))
    .limit(1);

  if (!lead) {
    throw new WhatsAppSendError("Lead not found", 404);
  }

  const isTestSend = Boolean(input.overridePhone?.trim());
  const targetPhone = isTestSend ? input.overridePhone!.trim() : lead.phone;

  if (!targetPhone?.trim()) {
    throw new WhatsAppSendError("This lead has no phone number", 400);
  }

  const normalizedPhone = normalizePhoneForWhatsApp(targetPhone);
  if (!normalizedPhone) {
    throw new WhatsAppSendError("Invalid phone number for WhatsApp", 400);
  }

  if (input.kind === "proposal" && !isTestSend) {
    if (config.qualificationEnabled) {
      if (lead.hasWhatsapp !== true) {
        throw new WhatsAppSendError(
          "This number is not qualified for WhatsApp. Wait for the WhatsApp check to finish.",
          400,
        );
      }
    } else if (lead.hasWhatsapp === false) {
      throw new WhatsAppSendError(
        "This number is not on WhatsApp. Wait for the WhatsApp check to finish or verify the phone number.",
        400,
      );
    }

    if (config.leadDedupeSameDay) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const [sentToday] = await db
        .select({ id: whatsappMessages.id })
        .from(whatsappMessages)
        .innerJoin(
          whatsappConversations,
          eq(whatsappMessages.conversationId, whatsappConversations.id),
        )
        .where(
          and(
            eq(whatsappConversations.customerPhone, normalizedPhone),
            eq(whatsappMessages.direction, "outbound"),
            gte(whatsappMessages.createdAt, startOfDay),
          ),
        )
        .limit(1);
      if (sentToday) {
        throw new WhatsAppSendError(
          "A WhatsApp message was already sent to this number today.",
          429,
        );
      }
    }

    if (config.promptThrottleMs > 0) {
      const since = new Date(Date.now() - config.promptThrottleMs);
      const [recentSend] = await db
        .select({ id: whatsappMessages.id })
        .from(whatsappMessages)
        .innerJoin(
          whatsappConversations,
          eq(whatsappMessages.conversationId, whatsappConversations.id),
        )
        .where(
          and(
            eq(whatsappConversations.customerPhone, normalizedPhone),
            eq(whatsappMessages.direction, "outbound"),
            gte(whatsappMessages.createdAt, since),
          ),
        )
        .orderBy(desc(whatsappMessages.createdAt))
        .limit(1);
      if (recentSend) {
        throw new WhatsAppSendError(
          `Please wait before sending another message to this number (${Math.round(config.promptThrottleMs / 1000)}s throttle).`,
          429,
        );
      }
    }
  }

  const contact = await checkWahaContactExists(targetPhone);
  if (!contact.exists || !contact.chatId) {
    throw new WhatsAppSendError("This number is not on WhatsApp", 400);
  }

  const { waMessageId } = await sendWahaTextMessage({
    chatId: contact.chatId,
    text: proposalBody,
  });

  if (isTestSend) {
    return { conversationId: "", waMessageId };
  }

  let conversationId: string;
  const [existingConv] = await db
    .select({ id: whatsappConversations.id })
    .from(whatsappConversations)
    .where(eq(whatsappConversations.leadId, input.leadId))
    .limit(1);

  if (existingConv) {
    conversationId = existingConv.id;
    await db
      .update(whatsappConversations)
      .set({
        lastMessageAt: new Date(),
        displayName: lead.title,
        industry: lead.industry,
        customerChatId: contact.chatId,
      })
      .where(eq(whatsappConversations.id, conversationId));
  } else {
    const [byPhone] = await db
      .select({ id: whatsappConversations.id })
      .from(whatsappConversations)
      .where(
        and(
          eq(whatsappConversations.agentId, input.agentId),
          eq(whatsappConversations.customerPhone, normalizedPhone),
        ),
      )
      .limit(1);

    if (byPhone) {
      conversationId = byPhone.id;
      await db
        .update(whatsappConversations)
        .set({
          lastMessageAt: new Date(),
          displayName: lead.title,
          industry: lead.industry,
          customerChatId: contact.chatId,
          leadId: input.leadId,
        })
        .where(eq(whatsappConversations.id, conversationId));
    } else {
      const [createdConv] = await db
        .insert(whatsappConversations)
        .values({
          agentId: input.agentId,
          leadId: input.leadId,
          customerPhone: normalizedPhone,
          customerChatId: contact.chatId,
          displayName: lead.title,
          industry: lead.industry,
        })
        .returning({ id: whatsappConversations.id });
      conversationId = createdConv.id;
    }
  }

  await db.insert(whatsappMessages).values({
    conversationId,
    direction: "outbound",
    body: proposalBody,
    waMessageId,
    status: "sent",
  });

  return { conversationId, waMessageId };
}
