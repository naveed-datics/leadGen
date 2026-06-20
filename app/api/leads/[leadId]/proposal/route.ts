import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { serializeProposal } from "@/lib/agent-settings";
import { getDb } from "@/lib/db/index";
import { leads, proposals } from "@/lib/db/schema";
import {
  PROPOSAL_STATUS_IN_PROGRESS,
} from "@/lib/proposal-status";

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
      .select({ id: leads.id })
      .from(leads)
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

    if (existing?.status === "sent" || existing?.status === "replied") {
      return NextResponse.json(
        { error: "Cannot edit a sent proposal" },
        { status: 400 },
      );
    }

    let proposal;
    if (existing) {
      [proposal] = await db
        .update(proposals)
        .set({
          body: proposalBody,
          status: PROPOSAL_STATUS_IN_PROGRESS,
          updatedAt: new Date(),
        })
        .where(eq(proposals.id, existing.id))
        .returning();
    } else {
      [proposal] = await db
        .insert(proposals)
        .values({
          leadId,
          body: proposalBody,
          status: PROPOSAL_STATUS_IN_PROGRESS,
        })
        .returning();
    }

    return NextResponse.json({
      proposal: serializeProposal(proposal),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save proposal";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
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

  let body: { status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.status !== "sent") {
    return NextResponse.json(
      { error: "Only status 'sent' is supported" },
      { status: 400 },
    );
  }

  try {
    const db = getDb();

    const [existing] = await db
      .select()
      .from(proposals)
      .where(eq(proposals.leadId, leadId))
      .limit(1);

    if (!existing) {
      return NextResponse.json(
        { error: "Save a draft proposal before marking as sent" },
        { status: 400 },
      );
    }

    if (existing.status === "sent") {
      return NextResponse.json(
        { error: "Proposal is already sent" },
        { status: 400 },
      );
    }

    const [proposal] = await db
      .update(proposals)
      .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
      .where(eq(proposals.id, existing.id))
      .returning();

    return NextResponse.json({
      proposal: serializeProposal({ ...proposal, status: "sent" }),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update proposal";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
