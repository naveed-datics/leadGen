import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { serializeProposal } from "@/lib/agent-settings";
import { getDb } from "@/lib/db/index";
import { leads, proposals, searches } from "@/lib/db/schema";
import { AuthError, requireActiveAgent } from "@/lib/auth/guards";
import {
  sendWhatsAppMessageToLead,
  WhatsAppSendError,
} from "@/lib/integrations/send-whatsapp-message";
import { isWahaConfigured } from "@/lib/integrations/waha";
import { scheduleProposalFollowUps } from "@/lib/proposal-follow-up-sequence";

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
          "WhatsApp is not configured on this server. Ask an admin to set WAHA_BASE_URL.",
      },
      { status: 403 },
    );
  }

  let body: { body?: string; testPhone?: string };
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

  const testPhone = body.testPhone?.trim() || undefined;

  try {
    const db = getDb();

    const [lead] = await db
      .select({ id: leads.id })
      .from(leads)
      .innerJoin(searches, eq(leads.searchId, searches.id))
      .where(eq(leads.id, leadId))
      .limit(1);

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const [existing] = await db
      .select()
      .from(proposals)
      .where(eq(proposals.leadId, leadId))
      .limit(1);

    if (
      !testPhone &&
      (existing?.status === "sent" || existing?.status === "replied")
    ) {
      return NextResponse.json(
        { error: "Proposal was already sent via WhatsApp" },
        { status: 400 },
      );
    }

    const { waMessageId } = await sendWhatsAppMessageToLead({
      leadId,
      agentId: agent.id,
      body: proposalBody,
      kind: "proposal",
      overridePhone: testPhone,
    });

    if (testPhone) {
      return NextResponse.json({
        proposal: existing ? serializeProposal(existing) : null,
        whatsapp: { sent: true, test: true },
      });
    }

    const now = new Date();
    let proposal;

    if (existing) {
      [proposal] = await db
        .update(proposals)
        .set({
          body: proposalBody,
          status: "sent",
          sentAt: now,
          deliveredAt: null,
          readAt: null,
          outboundWaMessageId: waMessageId,
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
          outboundWaMessageId: waMessageId,
        })
        .returning();
    }

    await scheduleProposalFollowUps(proposal.id, now);

    return NextResponse.json({
      proposal: serializeProposal({ ...proposal, status: "sent" }),
      whatsapp: { sent: true },
    });
  } catch (error) {
    if (error instanceof WhatsAppSendError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "Failed to send WhatsApp message";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
