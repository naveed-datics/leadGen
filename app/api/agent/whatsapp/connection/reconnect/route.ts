import { NextResponse } from "next/server";
import { AuthError, requireActiveAgent } from "@/lib/auth/guards";
import {
  getWahaConfigForAgent,
  isWahaConfigured,
  prepareWahaSessionForQr,
  restartWahaSession,
  syncWahaSessionWebhook,
} from "@/lib/integrations/waha";
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

    const wahaConfig = getWahaConfigForAgent(agent.id);
    const origin = new URL(request.url).origin;
    const webhookUrl = getWebhookUrlForAgent(agent.id, origin);

    if (webhookUrl) {
      await syncWahaSessionWebhook(wahaConfig, webhookUrl);
    }

    try {
      await restartWahaSession(wahaConfig);
    } catch {
      await prepareWahaSessionForQr(wahaConfig, webhookUrl || undefined);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "Failed to reconnect session";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
