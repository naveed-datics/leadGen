import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { AuthError, requireActiveAgent } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/index";
import { whatsappConversations, whatsappMessages } from "@/lib/db/schema";

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

