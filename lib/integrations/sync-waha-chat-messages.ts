import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/index";
import { whatsappConversations, whatsappMessages } from "@/lib/db/schema";
import { ensureInboundLeadFromReply } from "@/lib/integrations/inbound-lead-create";
import { optionalCustomerChatId, hasCustomerChatIdColumn } from "@/lib/integrations/customer-chat-id-column";
import {
  checkWahaContactExists,
  fetchWahaChatMessages,
  isWahaConfigured,
} from "@/lib/integrations/waha";

/**
 * Pull recent WAHA chat history into LeadGen for a conversation.
 * Recovers inbound replies when webhooks were missed or failed.
 */
export async function syncConversationMessagesFromWaha(input: {
  conversationId: string;
  agentId: string;
}): Promise<{ imported: number }> {
  if (!isWahaConfigured()) return { imported: 0 };

  const db = getDb();
  const [conv] = await db
    .select({
      id: whatsappConversations.id,
      agentId: whatsappConversations.agentId,
      customerPhone: whatsappConversations.customerPhone,
    })
    .from(whatsappConversations)
    .where(eq(whatsappConversations.id, input.conversationId))
    .limit(1);

  if (!conv || conv.agentId !== input.agentId) return { imported: 0 };

  let chatId: string | null = null;

  if (await hasCustomerChatIdColumn()) {
    const [withChatId] = await db
      .select({ customerChatId: whatsappConversations.customerChatId })
      .from(whatsappConversations)
      .where(eq(whatsappConversations.id, conv.id))
      .limit(1);
    chatId = withChatId?.customerChatId?.trim() || null;
  }
  if (!chatId) {
    try {
      const contact = await checkWahaContactExists(conv.customerPhone);
      chatId = contact.chatId;
      if (chatId) {
        const chatIdFields = await optionalCustomerChatId(chatId);
        if (chatIdFields.customerChatId) {
          await db
            .update(whatsappConversations)
            .set(chatIdFields)
            .where(eq(whatsappConversations.id, conv.id));
        }
      }
    } catch {
      return { imported: 0 };
    }
  }

  if (!chatId) return { imported: 0 };

  let history;
  try {
    history = await fetchWahaChatMessages({ chatId, limit: 50 });
  } catch (error) {
    console.warn("[waha-sync] fetch messages failed:", error);
    return { imported: 0 };
  }

  let imported = 0;

  for (const msg of history) {
    if (msg.fromMe) continue;

    const body = msg.body?.trim() || (msg.hasMedia ? "[media]" : "");
    if (!body) continue;

    const waMessageId = msg.id?.trim() || null;
    const createdAt =
      typeof msg.timestamp === "number" && msg.timestamp > 0
        ? new Date(msg.timestamp * 1000)
        : new Date();

    if (waMessageId) {
      const [dupe] = await db
        .select({ id: whatsappMessages.id })
        .from(whatsappMessages)
        .where(eq(whatsappMessages.waMessageId, waMessageId))
        .limit(1);
      if (dupe) continue;
    }

    await db.insert(whatsappMessages).values({
      conversationId: conv.id,
      direction: "inbound",
      body,
      waMessageId,
      status: "received",
      createdAt,
    });
    imported += 1;

    try {
      await ensureInboundLeadFromReply({
        agentId: conv.agentId,
        conversationId: conv.id,
        customerPhone: conv.customerPhone,
        messageBody: body,
        repliedAt: createdAt,
      });
    } catch {
      // Best-effort — message already saved.
    }
  }

  if (imported > 0) {
    await db
      .update(whatsappConversations)
      .set({ lastMessageAt: new Date() })
      .where(eq(whatsappConversations.id, conv.id));
  }

  return { imported };
}
