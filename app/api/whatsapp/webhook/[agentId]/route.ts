import { NextResponse } from "next/server";
import { handleWahaWebhook, type WahaWebhookBody } from "@/lib/integrations/waha-webhook";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  try {
    await handleWahaWebhook(raw as WahaWebhookBody, { agentId });
  } catch {
    // Always acknowledge webhooks.
  }

  return NextResponse.json({ ok: true });
}
