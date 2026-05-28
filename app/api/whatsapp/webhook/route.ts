import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/index";
import {
  users,
  whatsappConversations,
  whatsappMessages,
} from "@/lib/db/schema";
import { normalizePhoneForWhatsApp } from "@/lib/whatsapp";

function getVerifyToken(): string {
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!token?.trim()) {
    throw new Error("WHATSAPP_VERIFY_TOKEN is not set");
  }
  return token.trim();
}

// Meta verification handshake:
// GET ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && challenge) {
    try {
      if (token !== getVerifyToken()) {
        return new NextResponse("Forbidden", { status: 403 });
      }
      return new NextResponse(challenge, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Server misconfigured";
      return new NextResponse(msg, { status: 500 });
    }
  }

  return new NextResponse("Bad Request", { status: 400 });
}

type WebhookPayload = {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: {
        metadata?: { phone_number_id?: string };
        messages?: Array<{
          id?: string;
          from?: string;
          timestamp?: string;
          text?: { body?: string };
          type?: string;
        }>;
      };
    }>;
  }>;
};

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: true });
  }

  let payload: WebhookPayload;
  try {
    payload = (await request.json()) as WebhookPayload;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const entries = payload.entry ?? [];
  if (entries.length === 0) return NextResponse.json({ ok: true });

  const db = getDb();

  for (const entry of entries) {
    const changes = entry.changes ?? [];
    for (const change of changes) {
      if (change.field !== "messages") continue;
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id?.trim() ?? "";
      const messages = value?.messages ?? [];
      if (!phoneNumberId || messages.length === 0) continue;

      // Map inbound messages to the agent owning this phone_number_id.
      const [agent] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, "agent"), eq(users.waPhoneNumberId, phoneNumberId)))
        .limit(1);

      if (!agent) continue;

      for (const msg of messages) {
        const from = msg.from?.trim() ?? "";
        const body = msg.text?.body?.trim() ?? "";
        const waMessageId = msg.id?.trim() ?? null;

        // Only store text messages for now.
        if (!from || !body) continue;

        const normalizedFrom = normalizePhoneForWhatsApp(from) ?? from;

        // Find/create conversation by agent + customer phone.
        const [existingConv] = await db
          .select({ id: whatsappConversations.id })
          .from(whatsappConversations)
          .where(
            and(
              eq(whatsappConversations.agentId, agent.id),
              eq(whatsappConversations.customerPhone, normalizedFrom),
            ),
          )
          .orderBy(desc(whatsappConversations.lastMessageAt))
          .limit(1);

        const now = new Date();
        let conversationId: string;
        if (existingConv) {
          conversationId = existingConv.id;
          await db
            .update(whatsappConversations)
            .set({ lastMessageAt: now })
            .where(eq(whatsappConversations.id, conversationId));
        } else {
          const [created] = await db
            .insert(whatsappConversations)
            .values({
              agentId: agent.id,
              customerPhone: normalizedFrom,
              displayName: normalizedFrom,
              lastMessageAt: now,
            })
            .returning({ id: whatsappConversations.id });
          conversationId = created.id;
        }

        // Best-effort dedupe on waMessageId (if provided).
        if (waMessageId) {
          const [dupe] = await db
            .select({ id: whatsappMessages.id })
            .from(whatsappMessages)
            .where(eq(whatsappMessages.waMessageId, waMessageId))
            .limit(1);
          if (dupe) continue;
        }

        await db.insert(whatsappMessages).values({
          conversationId,
          direction: "inbound",
          body,
          waMessageId,
          status: "received",
          createdAt: now,
        });
      }
    }
  }

  return NextResponse.json({ ok: true });
}

