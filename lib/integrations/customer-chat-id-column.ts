import { getDb } from "@/lib/db/index";
import { whatsappConversations } from "@/lib/db/schema";

let customerChatIdColumnAvailable: boolean | null = null;

/** Cached check — whatsapp_conversations.customer_chat_id may be missing on older DBs. */
export async function hasCustomerChatIdColumn(): Promise<boolean> {
  if (customerChatIdColumnAvailable !== null) {
    return customerChatIdColumnAvailable;
  }

  try {
    const db = getDb();
    await db
      .select({ customerChatId: whatsappConversations.customerChatId })
      .from(whatsappConversations)
      .limit(1);
    customerChatIdColumnAvailable = true;
  } catch {
    customerChatIdColumnAvailable = false;
  }

  return customerChatIdColumnAvailable;
}

export async function optionalCustomerChatId(
  chatId: string | null | undefined,
): Promise<{ customerChatId?: string }> {
  if (!chatId?.trim()) return {};
  if (!(await hasCustomerChatIdColumn())) return {};
  return { customerChatId: chatId.trim() };
}
