import { NextResponse } from "next/server";
import {
  handleWahaWebhook,
  type WahaWebhookBody,
} from "@/lib/integrations/waha-webhook";

function verifyWebhookSecret(request: Request): boolean {
  const secret = process.env.WAHA_WEBHOOK_SECRET?.trim();
  if (!secret) return true;
  return request.headers.get("x-webhook-secret") === secret;
}

export async function POST(request: Request) {
  if (!verifyWebhookSecret(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: true });
  }

  let body: WahaWebhookBody;
  try {
    body = (await request.json()) as WahaWebhookBody;
  } catch {
    return NextResponse.json({ ok: true });
  }

  try {
    await handleWahaWebhook(body);
  } catch (error) {
    console.error("[waha-webhook] handler failed:", error);
  }

  return NextResponse.json({ ok: true });
}
