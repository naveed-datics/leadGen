import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/index";
import { inboundLeads, users } from "@/lib/db/schema";
import { syncInboundLeadsFromRepliedConversations } from "@/lib/integrations/inbound-lead-create";

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "Database is not configured" },
      { status: 500 },
    );
  }

  try {
    const user = await requireAuth();
    const db = getDb();
    const shouldSync =
      new URL(request.url).searchParams.get("sync") === "1";

    if (shouldSync) {
      await syncInboundLeadsFromRepliedConversations(
        user.role === "agent" ? user.id : undefined,
      );
    }

    const rows = await db
      .select({
        id: inboundLeads.id,
        conversationId: inboundLeads.conversationId,
        businessName: inboundLeads.businessName,
        phone: inboundLeads.phone,
        industry: inboundLeads.industry,
        firstReplyAt: inboundLeads.firstReplyAt,
        lastReplyAt: inboundLeads.lastReplyAt,
        lastReplyBody: inboundLeads.lastReplyBody,
        agentName: users.name,
      })
      .from(inboundLeads)
      .innerJoin(users, eq(inboundLeads.agentId, users.id))
      .where(user.role === "agent" ? eq(inboundLeads.agentId, user.id) : undefined)
      .orderBy(desc(inboundLeads.lastReplyAt))
      .limit(500);

    return NextResponse.json({
      leads: rows.map((row) => ({
        id: row.id,
        conversationId: row.conversationId,
        businessName: row.businessName,
        phone: row.phone,
        industry: row.industry,
        firstReplyAt: row.firstReplyAt.toISOString(),
        lastReplyAt: row.lastReplyAt.toISOString(),
        lastReplyBody: row.lastReplyBody,
        agentName: user.role === "admin" ? row.agentName : null,
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "Failed to load inbound leads";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
