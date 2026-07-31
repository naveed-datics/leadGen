import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { AuthError, requireActiveAgent } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/index";
import { inboundLeads, whatsappConversations, whatsappMessages } from "@/lib/db/schema";
import { handleWahaWebhook } from "@/lib/integrations/waha-webhook";
import { wahaSessionForAgent } from "@/lib/integrations/waha";
import { normalizePhoneForWhatsApp } from "@/lib/whatsapp";

type TestInboundBody = {
  phone?: unknown;
  message?: unknown;
};

async function hasOutboundToPhone(agentId: string, phone: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ id: whatsappMessages.id })
    .from(whatsappMessages)
    .innerJoin(
      whatsappConversations,
      eq(whatsappMessages.conversationId, whatsappConversations.id),
    )
    .where(
      and(
        eq(whatsappConversations.agentId, agentId),
        eq(whatsappConversations.customerPhone, phone),
        eq(whatsappMessages.direction, "outbound"),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Session-authed simulator for local inbound testing.
 * Runs the same handler as WAHA webhooks without needing ngrok.
 */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "Database is not configured" },
      { status: 500 },
    );
  }

  try {
    const agent = await requireActiveAgent();

    let body: TestInboundBody;
    try {
      body = (await request.json()) as TestInboundBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const phoneRaw = typeof body.phone === "string" ? body.phone.trim() : "";
    const message =
      typeof body.message === "string" && body.message.trim()
        ? body.message.trim()
        : "Test inbound reply";

    if (!phoneRaw) {
      return NextResponse.json({ error: "phone is required" }, { status: 400 });
    }

    const normalizedPhone = normalizePhoneForWhatsApp(phoneRaw);
    if (!normalizedPhone) {
      return NextResponse.json(
        { error: "Invalid phone number (need at least 10 digits)" },
        { status: 400 },
      );
    }

    const hadOutbound = await hasOutboundToPhone(agent.id, normalizedPhone);

    await handleWahaWebhook(
      {
        event: "message",
        session: wahaSessionForAgent(agent.id),
        payload: {
          id: `local-test-${Date.now()}`,
          from: `${normalizedPhone}@c.us`,
          fromMe: false,
          body: message,
        },
      },
      { agentId: agent.id },
    );

    const db = getDb();

    const [inboundLead] = await db
      .select({
        id: inboundLeads.id,
        businessName: inboundLeads.businessName,
        phone: inboundLeads.phone,
        lastReplyBody: inboundLeads.lastReplyBody,
        lastReplyAt: inboundLeads.lastReplyAt,
      })
      .from(inboundLeads)
      .where(
        and(
          eq(inboundLeads.agentId, agent.id),
          eq(inboundLeads.phone, normalizedPhone),
        ),
      )
      .limit(1);

    const [conversation] = await db
      .select({ id: whatsappConversations.id })
      .from(whatsappConversations)
      .where(
        and(
          eq(whatsappConversations.agentId, agent.id),
          eq(whatsappConversations.customerPhone, normalizedPhone),
        ),
      )
      .orderBy(desc(whatsappConversations.lastMessageAt))
      .limit(1);

    const created = Boolean(inboundLead);
    let hint: string | null = null;
    if (!created && !hadOutbound) {
      hint =
        "No outbound message found for this number. Send a WhatsApp message to this contact from a search lead first, then run the test again.";
    } else if (!created && hadOutbound) {
      hint =
        "Inbound was processed but no inbound lead was created. Check server logs or try /api/leads/inbound?sync=1.";
    } else if (created) {
      hint = "Inbound lead created or updated. Open /leads to verify.";
    }

    return NextResponse.json({
      ok: true,
      created,
      phone: normalizedPhone,
      hadOutboundBeforeTest: hadOutbound,
      conversationId: conversation?.id ?? null,
      inboundLead: inboundLead
        ? {
            id: inboundLead.id,
            businessName: inboundLead.businessName,
            phone: inboundLead.phone,
            lastReplyBody: inboundLead.lastReplyBody,
            lastReplyAt: inboundLead.lastReplyAt.toISOString(),
          }
        : null,
      hint,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "Failed to simulate inbound reply";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
