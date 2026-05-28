import { NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { AuthError, requireActiveAgent } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/index";
import {
  users,
  whatsappConversations,
  whatsappMessages,
} from "@/lib/db/schema";
import { decryptSecret } from "@/lib/integrations/crypto";
import { normalizePhoneForWhatsApp } from "@/lib/whatsapp";
import {
  sendWhatsAppCloudTemplateMessage,
  sendWhatsAppCloudTextMessage,
  type WhatsAppTemplateBodyParam,
} from "@/lib/integrations/whatsapp-cloud";

const BodySchema = z
  .object({
    phone: z.string().min(1),
    mode: z.enum(["text", "template"]).default("text"),
    text: z.string().min(1).optional(),
    templateName: z.string().min(1).optional(),
    templateLanguage: z.string().min(1).optional(),
    templateParams: z.array(z.any()).optional(),
  })
  .refine(
    (v) =>
      (v.mode === "text" && Boolean(v.text?.trim())) ||
      (v.mode === "template" &&
        Boolean(v.templateName?.trim()) &&
        Boolean(v.templateLanguage?.trim())),
    { message: "Invalid message mode payload" },
  );

export async function POST(request: Request) {
  let agent;
  try {
    agent = await requireActiveAgent();
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 401 });
  }

  if (!agent.whatsAppEnabled) {
    return NextResponse.json(
      { error: "WhatsApp is disabled by admin" },
      { status: 403 },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const normalizedPhone = normalizePhoneForWhatsApp(parsed.data.phone);
  if (!normalizedPhone) {
    return NextResponse.json(
      { error: "Invalid phone number for WhatsApp" },
      { status: 400 },
    );
  }

  const text = parsed.data.text?.trim() ?? "";

  try {
    const db = getDb();

    const [agentRow] = await db
      .select({
        waAccessTokenEnc: users.waAccessTokenEnc,
        waPhoneNumberId: users.waPhoneNumberId,
      })
      .from(users)
      .where(eq(users.id, agent.id))
      .limit(1);

    const waAccessTokenEnc = agentRow?.waAccessTokenEnc?.trim() ?? "";
    const waPhoneNumberId = agentRow?.waPhoneNumberId?.trim() ?? "";
    if (!waAccessTokenEnc || !waPhoneNumberId) {
      return NextResponse.json(
        { error: "WhatsApp is not configured. Add credentials in Settings." },
        { status: 403 },
      );
    }

    const waAccessToken = decryptSecret(waAccessTokenEnc);

    let waMessageId: string | null = null;
    let storedBody = "";

    if (parsed.data.mode === "template") {
      const params = (parsed.data.templateParams ?? []) as WhatsAppTemplateBodyParam[];
      const sent = await sendWhatsAppCloudTemplateMessage(
        { accessToken: waAccessToken, phoneNumberId: waPhoneNumberId },
        normalizedPhone,
        {
          name: parsed.data.templateName!.trim(),
          languageCode: parsed.data.templateLanguage!.trim(),
          bodyParams: params,
        },
      );
      waMessageId = sent.waMessageId;
      storedBody = `[template:${parsed.data.templateName}]`;
    } else {
      if (!text) {
        return NextResponse.json(
          { error: "Message text is required" },
          { status: 400 },
        );
      }
      const sent = await sendWhatsAppCloudTextMessage(
        { accessToken: waAccessToken, phoneNumberId: waPhoneNumberId },
        normalizedPhone,
        text,
      );
      waMessageId = sent.waMessageId;
      storedBody = text;
    }

    // Find or create conversation by agent + customer phone.
    const [existingConv] = await db
      .select({
        id: whatsappConversations.id,
      })
      .from(whatsappConversations)
      .where(
        and(
          eq(whatsappConversations.agentId, agent.id),
          eq(whatsappConversations.customerPhone, normalizedPhone),
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
          customerPhone: normalizedPhone,
          displayName: normalizedPhone,
          lastMessageAt: now,
        })
        .returning({ id: whatsappConversations.id });
      conversationId = created.id;
    }

    await db.insert(whatsappMessages).values({
      conversationId,
      direction: "outbound",
      body: storedBody,
      waMessageId,
      status: "sent",
      createdAt: now,
    });

    return NextResponse.json({ ok: true, conversationId });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start chat";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

