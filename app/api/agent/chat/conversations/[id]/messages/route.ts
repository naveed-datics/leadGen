import { NextResponse } from "next/server";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { AuthError, requireActiveAgent } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/index";
import { whatsappConversations, whatsappMessages } from "@/lib/db/schema";
import {
  checkWahaContactExists,
  isWahaConfigured,
  sendWahaTextMessage,
} from "@/lib/integrations/waha";
import { optionalCustomerChatId } from "@/lib/integrations/customer-chat-id-column";
import { syncConversationMessagesFromWaha } from "@/lib/integrations/sync-waha-chat-messages";

const ReplyBodySchema = z.object({
  text: z.string().min(1),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const agent = await requireActiveAgent();
    const { id } = await params;
    const db = getDb();

    const [conv] = await db
      .select({ id: whatsappConversations.id })
      .from(whatsappConversations)
      .where(and(eq(whatsappConversations.id, id), eq(whatsappConversations.agentId, agent.id)))
      .limit(1);

    if (!conv) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    // Recover inbound replies that arrived on WhatsApp but missed the webhook.
    try {
      await syncConversationMessagesFromWaha({
        conversationId: id,
        agentId: agent.id,
      });
    } catch (error) {
      console.warn("[chat] WAHA history sync failed:", error);
    }

    const rows = await db
      .select({
        id: whatsappMessages.id,
        direction: whatsappMessages.direction,
        body: whatsappMessages.body,
        status: whatsappMessages.status,
        createdAt: whatsappMessages.createdAt,
      })
      .from(whatsappMessages)
      .where(eq(whatsappMessages.conversationId, id))
      .orderBy(asc(whatsappMessages.createdAt))
      .limit(500);

    return NextResponse.json({
      messages: rows.map((m) => ({
        id: m.id,
        direction: m.direction,
        body: m.body,
        status: m.status,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to load messages";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let agent;
  try {
    agent = await requireActiveAgent();
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 401 });
  }

  if (!agent.whatsAppEnabled) {
    return NextResponse.json(
      { error: "WhatsApp is disabled by admin" },
      { status: 403 },
    );
  }

  if (!isWahaConfigured()) {
    return NextResponse.json(
      {
        error:
          "WhatsApp is not configured. Set WAHA_BASE_URL and WAHA_SESSION in .env.local",
      },
      { status: 403 },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ReplyBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Message text is required" }, { status: 400 });
  }

  const text = parsed.data.text.trim();
  if (!text) {
    return NextResponse.json({ error: "Message text is required" }, { status: 400 });
  }

  try {
    const { id } = await params;
    const db = getDb();

    const [conv] = await db
      .select({
        id: whatsappConversations.id,
        customerPhone: whatsappConversations.customerPhone,
      })
      .from(whatsappConversations)
      .where(
        and(eq(whatsappConversations.id, id), eq(whatsappConversations.agentId, agent.id)),
      )
      .limit(1);

    if (!conv) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const contact = await checkWahaContactExists(conv.customerPhone);
    if (!contact.exists || !contact.chatId) {
      return NextResponse.json(
        { error: "This number is not on WhatsApp" },
        { status: 400 },
      );
    }

    const { waMessageId } = await sendWahaTextMessage({
      chatId: contact.chatId,
      text,
    });

    const now = new Date();
    const chatIdFields = await optionalCustomerChatId(contact.chatId);

    await db
      .update(whatsappConversations)
      .set({ lastMessageAt: now, ...chatIdFields })
      .where(eq(whatsappConversations.id, conv.id));

    const [message] = await db
      .insert(whatsappMessages)
      .values({
        conversationId: conv.id,
        direction: "outbound",
        body: text,
        waMessageId,
        status: "sent",
        createdAt: now,
      })
      .returning({
        id: whatsappMessages.id,
        direction: whatsappMessages.direction,
        body: whatsappMessages.body,
        status: whatsappMessages.status,
        createdAt: whatsappMessages.createdAt,
      });

    return NextResponse.json({
      message: {
        id: message.id,
        direction: message.direction,
        body: message.body,
        status: message.status,
        createdAt: message.createdAt.toISOString(),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send message";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

