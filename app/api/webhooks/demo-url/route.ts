import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { verifySharedSecret } from "@/lib/auth/webhook-secret";
import { getAgentDemoUrlWebhookSecret } from "@/lib/agent-settings";
import { getDb } from "@/lib/db/index";
import { leads, proposals, searches } from "@/lib/db/schema";
import { PROPOSAL_STATUS_IN_PROGRESS } from "@/lib/proposal-status";
import { DEMO_STATUS_READY } from "@/lib/demo-status";

interface DemoUrlWebhookBody {
  leadId?: unknown;
  demoUrl?: unknown;
}

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "Database is not configured" },
      { status: 500 },
    );
  }

  let body: DemoUrlWebhookBody;
  try {
    body = (await request.json()) as DemoUrlWebhookBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { leadId, demoUrl } = body;
  if (typeof leadId !== "string" || !leadId.trim()) {
    return NextResponse.json({ error: "leadId is required" }, { status: 400 });
  }
  if (typeof demoUrl !== "string" || !demoUrl.trim()) {
    return NextResponse.json({ error: "demoUrl is required" }, { status: 400 });
  }

  try {
    const db = getDb();

    const [leadRow] = await db
      .select({ id: leads.id, agentId: searches.agentId })
      .from(leads)
      .innerJoin(searches, eq(leads.searchId, searches.id))
      .where(eq(leads.id, leadId))
      .limit(1);

    if (!leadRow) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const agentSecret = leadRow.agentId
      ? await getAgentDemoUrlWebhookSecret(leadRow.agentId)
      : null;

    const authorized = agentSecret
      ? request.headers.get("x-webhook-secret") === agentSecret
      : verifySharedSecret(request, "DEMO_URL_WEBHOOK_SECRET");

    if (!authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [existing] = await db
      .select()
      .from(proposals)
      .where(eq(proposals.leadId, leadId))
      .limit(1);

    if (existing?.status === "sent" || existing?.status === "replied") {
      return NextResponse.json(
        { error: "Cannot update demo URL for a sent proposal" },
        { status: 400 },
      );
    }

    if (existing) {
      await db
        .update(proposals)
        .set({ demoUrl, demoStatus: DEMO_STATUS_READY, updatedAt: new Date() })
        .where(eq(proposals.id, existing.id));
    } else {
      await db.insert(proposals).values({
        leadId,
        body: "",
        status: PROPOSAL_STATUS_IN_PROGRESS,
        demoUrl,
        demoStatus: DEMO_STATUS_READY,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[demo-url-webhook] failed:", error);
    const message =
      error instanceof Error ? error.message : "Failed to save demo URL";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
