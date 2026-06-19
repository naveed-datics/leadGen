import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/index";
import {
  users,
  whatsappConversations,
  whatsappMessages,
} from "@/lib/db/schema";
import { normalizePhoneForWhatsApp } from "@/lib/whatsapp";
import {
  handleWahaWebhook,
  isWahaWebhookPayload,
  type WahaWebhookBody,
} from "@/lib/integrations/waha-webhook";

function getVerifyToken(): string {
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!token?.trim()) {
    throw new Error("WHATSAPP_VERIFY_TOKEN is not set");
  }
  return token.trim();
}

function verifyWebhookSecret(request: Request): boolean {
  const secret = process.env.WAHA_WEBHOOK_SECRET?.trim();
  if (!secret) return true;
  return request.headers.get("x-webhook-secret") === secret;
}

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

async function handleMetaWebhook(payload: WebhookPayload): Promise<void> {
  const entries = payload.entry ?? [];
  if (entries.length === 0) return;

  const db = getDb();

  for (const entry of entries) {
    const changes = entry.changes ?? [];
    for (const change of changes) {
      if (change.field !== "messages") continue;
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id?.trim() ?? "";
      const messages = value?.messages ?? [];
      if (!phoneNumberId || messages.length === 0) continue;

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

        if (!from || !body) continue;

        const normalizedFrom = normalizePhoneForWhatsApp(from) ?? from;

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
}

export async function POST(request: Request) {
  if (!verifyWebhookSecret(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: true });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  try {
    if (isWahaWebhookPayload(raw)) {
      await handleWahaWebhook(raw as WahaWebhookBody);
    } else {
      await handleMetaWebhook(raw as WebhookPayload);
    }
  } catch {
    // Always acknowledge webhooks.
  }

  return NextResponse.json({ ok: true });
}
