import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { AuthError, requireActiveAgent } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/index";
import { whatsappConversations } from "@/lib/db/schema";

export async function GET() {
  try {
    const agent = await requireActiveAgent();
    const db = getDb();
    const rows = await db
      .select({
        id: whatsappConversations.id,
        leadId: whatsappConversations.leadId,
        customerPhone: whatsappConversations.customerPhone,
        displayName: whatsappConversations.displayName,
        lastMessageAt: whatsappConversations.lastMessageAt,
      })
      .from(whatsappConversations)
      .where(eq(whatsappConversations.agentId, agent.id))
      .orderBy(desc(whatsappConversations.lastMessageAt))
      .limit(200);

    return NextResponse.json({
      conversations: rows.map((r) => ({
        id: r.id,
        leadId: r.leadId,
        customerPhone: r.customerPhone,
        displayName: r.displayName ?? r.customerPhone,
        lastMessageAt: r.lastMessageAt.toISOString(),
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to load conversations";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

