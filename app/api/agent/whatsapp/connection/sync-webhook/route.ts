import { NextResponse } from "next/server";
import { AuthError, requireActiveAgent } from "@/lib/auth/guards";
import { isWahaConfigured, syncWahaSessionWebhook } from "@/lib/integrations/waha";
import { getWebhookUrlForAgent } from "@/lib/integrations/whatsapp-config";

export async function POST() {
  try {
    const agent = await requireActiveAgent();

    if (!isWahaConfigured()) {
      return NextResponse.json(
        { error: "WAHA is not configured on this server" },
        { status: 503 },
      );
    }

    const webhookUrl = getWebhookUrlForAgent(agent.id);
    if (!webhookUrl) {
      return NextResponse.json(
        {
          error:
            "Webhook URL is not configured. Set WAHA_WEBHOOK_BASE_URL or WHATSAPP_HOOK_URL in .env.local",
        },
        { status: 400 },
      );
    }

    await syncWahaSessionWebhook(webhookUrl);

    return NextResponse.json({ ok: true, webhookUrl });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "Failed to register webhook";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
