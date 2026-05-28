import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/index";
import { leads, proposals } from "@/lib/db/schema";
import { isGreenApiConfigured, sendWhatsAppMessage } from "@/lib/whatsapp";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ leadId: string }> },
) {
  const { leadId } = await params;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "Database is not configured" },
      { status: 500 },
    );
  }

  if (!isGreenApiConfigured()) {
    return NextResponse.json(
      {
        error:
          "Green API is not configured. Add GREEN_API_INSTANCE_ID and GREEN_API_TOKEN to .env.local, then authorize your WhatsApp at https://green-api.com",
      },
      { status: 503 },
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

    await sendWhatsAppMessage(lead.phone, proposalBody);

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
