import { NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { AuthError, requireActiveAgent } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/index";
import { whatsappConversations, whatsappMessages } from "@/lib/db/schema";
import {
  checkWahaContactExists,
  isWahaConfigured,
  sendWahaTextMessage,
} from "@/lib/integrations/waha";
import { optionalCustomerChatId } from "@/lib/integrations/customer-chat-id-column";
import { normalizePhoneForWhatsApp } from "@/lib/whatsapp";

const BodySchema = z.object({
  phone: z.string().min(1),
  text: z.string().min(1),
  businessName: z.string().optional(),
  industry: z.string().optional(),
});

export async function POST(request: Request) {
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

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const normalizedPhone = normalizePhoneForWhatsApp(parsed.data.phone);
  if (!normalizedPhone) {
    return NextResponse.json(
      { error: "Invalid phone number for WhatsApp" },
      { status: 400 },
    );
  }

  const text = parsed.data.text.trim();
  if (!text) {
    return NextResponse.json(
      { error: "Message text is required" },
      { status: 400 },
    );
  }

  const businessName = parsed.data.businessName?.trim() || normalizedPhone;
  const industry = parsed.data.industry?.trim() || null;

  try {
    const contact = await checkWahaContactExists(parsed.data.phone);
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

    const chatIdFields = await optionalCustomerChatId(contact.chatId);
    const db = getDb();

    const [existingConv] = await db
      .select({
        id: whatsappConversations.id,
      })
      .from(whatsappConversations)
      .where(
        and(
          eq(whatsappConversations.agentId, agent.id),
          eq(whatsappConversations.customerPhone, normalizedPhone),
        ),
      )
      .orderBy(desc(whatsappConversations.lastMessageAt))
      .limit(1);

    const now = new Date();
    let conversationId: string;
    if (existingConv) {
      conversationId = existingConv.id;
      await db
        .update(whatsappConversations)
        .set({
          lastMessageAt: now,
          displayName: businessName,
          industry,
          ...chatIdFields,
        })
        .where(eq(whatsappConversations.id, conversationId));
    } else {
      const [created] = await db
        .insert(whatsappConversations)
        .values({
          agentId: agent.id,
          customerPhone: normalizedPhone,
          displayName: businessName,
          industry,
          lastMessageAt: now,
          ...chatIdFields,
        })
        .returning({ id: whatsappConversations.id });
      conversationId = created.id;
    }

    await db.insert(whatsappMessages).values({
      conversationId,
      direction: "outbound",
      body: text,
      waMessageId,
      status: "sent",
      createdAt: now,
    });

    return NextResponse.json({ ok: true, conversationId });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start chat";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
