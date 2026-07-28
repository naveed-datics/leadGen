import { NextResponse } from "next/server";
import { AuthError, requireActiveAgent } from "@/lib/auth/guards";
import { isWahaConfigured, syncWahaSessionWebhook } from "@/lib/integrations/waha";
import { getWebhookUrlForAgent } from "@/lib/integrations/whatsapp-config";

export async function POST(request: Request) {
  try {
    const agent = await requireActiveAgent();

    if (!isWahaConfigured()) {
      return NextResponse.json(
        { error: "WAHA is not configured on this server" },
        { status: 503 },
      );
    }

    const origin = new URL(request.url).origin;
    const webhookUrl = getWebhookUrlForAgent(agent.id, origin);
    if (!webhookUrl) {
      return NextResponse.json(
        {
          error:
            "Could not determine a public webhook URL. Use a deployed app URL or set WAHA_WEBHOOK_BASE_URL.",
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
