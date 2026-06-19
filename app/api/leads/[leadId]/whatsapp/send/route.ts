import { and, desc, eq, gte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/index";
import { leads, proposals } from "@/lib/db/schema";
import { AuthError, requireActiveAgent } from "@/lib/auth/guards";
import { whatsappConversations, whatsappMessages } from "@/lib/db/schema";
import {
  checkWahaContactExists,
  isWahaConfigured,
  sendWahaTextMessage,
} from "@/lib/integrations/waha";
import { getWhatsAppConfig } from "@/lib/integrations/whatsapp-config";
import { normalizePhoneForWhatsApp } from "@/lib/whatsapp";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ leadId: string }> },
) {
  const { leadId } = await params;

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

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "Database is not configured" },
      { status: 500 },
    );
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

  let body: { body?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const proposalBody = body.body?.trim();
  if (!proposalBody) {
    return NextResponse.json(
      { error: "Proposal body is required" },
      { status: 400 },
    );
  }

  try {
    const db = getDb();
    const config = getWhatsAppConfig();

    const [lead] = await db
      .select({
        id: leads.id,
        phone: leads.phone,
        hasWhatsapp: leads.hasWhatsapp,
        title: leads.title,
      })
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    if (!lead.phone?.trim()) {
      return NextResponse.json(
        { error: "This lead has no phone number" },
        { status: 400 },
      );
    }

    const normalizedPhone = normalizePhoneForWhatsApp(lead.phone);
    if (!normalizedPhone) {
      return NextResponse.json(
        { error: "Invalid phone number for WhatsApp" },
        { status: 400 },
      );
    }

    if (config.qualificationEnabled) {
      if (lead.hasWhatsapp !== true) {
        return NextResponse.json(
          {
            error:
              "This number is not qualified for WhatsApp. Wait for the WhatsApp check to finish.",
          },
          { status: 400 },
        );
      }
    } else if (lead.hasWhatsapp === false) {
      return NextResponse.json(
        {
          error:
            "This number is not on WhatsApp. Wait for the WhatsApp check to finish or verify the phone number.",
        },
        { status: 400 },
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
        return NextResponse.json(
          { error: "A WhatsApp message was already sent to this number today." },
          { status: 429 },
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
        return NextResponse.json(
          {
            error: `Please wait before sending another message to this number (${Math.round(config.promptThrottleMs / 1000)}s throttle).`,
          },
          { status: 429 },
        );
      }
    }

    const [existing] = await db
      .select()
      .from(proposals)
      .where(eq(proposals.leadId, leadId))
      .limit(1);

    if (existing?.status === "sent" || existing?.status === "replied") {
      return NextResponse.json(
        { error: "Proposal was already sent via WhatsApp" },
        { status: 400 },
      );
    }

    const contact = await checkWahaContactExists(lead.phone);
    if (!contact.exists || !contact.chatId) {
      return NextResponse.json(
        { error: "This number is not on WhatsApp" },
        { status: 400 },
      );
    }

    const { waMessageId } = await sendWahaTextMessage({
      chatId: contact.chatId,
      text: proposalBody,
    });

    let conversationId: string;
    const [existingConv] = await db
      .select({ id: whatsappConversations.id })
      .from(whatsappConversations)
      .where(eq(whatsappConversations.leadId, leadId))
      .limit(1);

    if (existingConv) {
      conversationId = existingConv.id;
      await db
        .update(whatsappConversations)
        .set({ lastMessageAt: new Date() })
        .where(eq(whatsappConversations.id, conversationId));
    } else {
      const [createdConv] = await db
        .insert(whatsappConversations)
        .values({
          agentId: agent.id,
          leadId,
          customerPhone: normalizedPhone,
          displayName: lead.title,
        })
        .returning({ id: whatsappConversations.id });
      conversationId = createdConv.id;
    }

    await db.insert(whatsappMessages).values({
      conversationId,
      direction: "outbound",
      body: proposalBody,
      waMessageId,
      status: "sent",
    });

    const now = new Date();
    let proposal;

    if (existing) {
      [proposal] = await db
        .update(proposals)
        .set({
          body: proposalBody,
          status: "sent",
          sentAt: now,
          updatedAt: now,
        })
        .where(eq(proposals.id, existing.id))
        .returning();
    } else {
      [proposal] = await db
        .insert(proposals)
        .values({
          leadId,
          body: proposalBody,
          status: "sent",
          sentAt: now,
        })
        .returning();
    }

    return NextResponse.json({
      proposal: {
        id: proposal.id,
        status: "sent" as const,
        body: proposal.body,
        sentAt: proposal.sentAt?.toISOString() ?? null,
        repliedAt: proposal.repliedAt?.toISOString() ?? null,
      },
      whatsapp: { sent: true },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send WhatsApp message";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
