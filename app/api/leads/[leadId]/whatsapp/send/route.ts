import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/index";
import { leads, proposals } from "@/lib/db/schema";
import { AuthError, requireActiveAgent } from "@/lib/auth/guards";
import {
  users,
  whatsappConversations,
  whatsappMessages,
} from "@/lib/db/schema";
import { decryptSecret } from "@/lib/integrations/crypto";
import { normalizePhoneForWhatsApp } from "@/lib/whatsapp";
import { sendWhatsAppCloudTextMessage } from "@/lib/integrations/whatsapp-cloud";

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

    const [agentRow] = await db
      .select({
        waAccessTokenEnc: users.waAccessTokenEnc,
        waPhoneNumberId: users.waPhoneNumberId,
      })
      .from(users)
      .where(eq(users.id, agent.id))
      .limit(1);

    const waAccessTokenEnc = agentRow?.waAccessTokenEnc?.trim() ?? "";
    const waPhoneNumberId = agentRow?.waPhoneNumberId?.trim() ?? "";
    if (!waAccessTokenEnc || !waPhoneNumberId) {
      return NextResponse.json(
        { error: "WhatsApp is not configured. Add credentials in Settings." },
        { status: 403 },
      );
    }

    const waAccessToken = decryptSecret(waAccessTokenEnc);

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

    if (lead.hasWhatsapp === false) {
      return NextResponse.json(
        {
          error:
            "This number is not on WhatsApp. Wait for the WhatsApp check to finish or verify the phone number.",
        },
        { status: 400 },
      );
    }

    const [existing] = await db
      .select()
      .from(proposals)
      .where(eq(proposals.leadId, leadId))
      .limit(1);

    if (existing?.status === "sent") {
      return NextResponse.json(
        { error: "Proposal was already sent via WhatsApp" },
        { status: 400 },
      );
    }

    const { waMessageId } = await sendWhatsAppCloudTextMessage(
      { accessToken: waAccessToken, phoneNumberId: waPhoneNumberId },
      normalizedPhone,
      proposalBody,
    );

    // Store into agent chat inbox.
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
      },
      whatsapp: { sent: true },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send WhatsApp message";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
