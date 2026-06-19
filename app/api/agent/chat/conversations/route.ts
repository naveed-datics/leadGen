import { NextResponse } from "next/server";
import { and, desc, eq, exists, not, sql } from "drizzle-orm";
import { AuthError, requireActiveAgent } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/index";
import {
  leads,
  searches,
  whatsappConversations,
  whatsappMessages,
} from "@/lib/db/schema";

type ConversationFilter = "inbox" | "sent" | "contacts" | "all";

function parseFilter(value: string | null): ConversationFilter {
  if (value === "inbox" || value === "sent" || value === "contacts") return value;
  return "all";
}

export async function GET(request: Request) {
  try {
    const agent = await requireActiveAgent();
    const db = getDb();
    const filter = parseFilter(new URL(request.url).searchParams.get("filter"));

    const inboundExists = exists(
      db
        .select({ id: whatsappMessages.id })
        .from(whatsappMessages)
        .where(
          and(
            eq(whatsappMessages.conversationId, whatsappConversations.id),
            eq(whatsappMessages.direction, "inbound"),
          ),
        ),
    );

    const outboundExists = exists(
      db
        .select({ id: whatsappMessages.id })
        .from(whatsappMessages)
        .where(
          and(
            eq(whatsappMessages.conversationId, whatsappConversations.id),
            eq(whatsappMessages.direction, "outbound"),
          ),
        ),
    );

    const filterClause =
      filter === "inbox"
        ? and(inboundExists, outboundExists)
        : filter === "sent"
          ? and(outboundExists, not(inboundExists))
          : filter === "contacts"
            ? outboundExists
            : undefined;

    const rows = await db
      .select({
        id: whatsappConversations.id,
        leadId: whatsappConversations.leadId,
        customerPhone: whatsappConversations.customerPhone,
        displayName: whatsappConversations.displayName,
        conversationIndustry: whatsappConversations.industry,
        searchIndustry: searches.industry,
        lastMessageAt: whatsappConversations.lastMessageAt,
        lastMessageBody: sql<string | null>`(
          SELECT ${whatsappMessages.body}
          FROM ${whatsappMessages}
          WHERE ${whatsappMessages.conversationId} = ${whatsappConversations.id}
          ORDER BY ${whatsappMessages.createdAt} DESC
          LIMIT 1
        )`.as("last_message_body"),
        lastMessageDirection: sql<string | null>`(
          SELECT ${whatsappMessages.direction}
          FROM ${whatsappMessages}
          WHERE ${whatsappMessages.conversationId} = ${whatsappConversations.id}
          ORDER BY ${whatsappMessages.createdAt} DESC
          LIMIT 1
        )`.as("last_message_direction"),
        hasSent: sql<boolean>`EXISTS (
          SELECT 1 FROM ${whatsappMessages}
          WHERE ${whatsappMessages.conversationId} = ${whatsappConversations.id}
          AND ${whatsappMessages.direction} = 'outbound'
        )`.as("has_sent"),
      })
      .from(whatsappConversations)
      .leftJoin(leads, eq(whatsappConversations.leadId, leads.id))
      .leftJoin(searches, eq(leads.searchId, searches.id))
      .where(
        filterClause
          ? and(eq(whatsappConversations.agentId, agent.id), filterClause)
          : eq(whatsappConversations.agentId, agent.id),
      )
      .orderBy(desc(whatsappConversations.lastMessageAt))
      .limit(200);

    return NextResponse.json({
      conversations: rows.map((r) => ({
        id: r.id,
        leadId: r.leadId,
        customerPhone: r.customerPhone,
        displayName: r.displayName ?? r.customerPhone,
        industry: r.conversationIndustry ?? r.searchIndustry ?? null,
        lastMessageAt: r.lastMessageAt.toISOString(),
        lastMessageBody: r.lastMessageBody ?? null,
        lastMessageDirection: r.lastMessageDirection ?? null,
        hasSent: Boolean(r.hasSent),
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
