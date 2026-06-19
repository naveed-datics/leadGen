import { NextResponse } from "next/server";
import { AuthError, requireActiveAgent } from "@/lib/auth/guards";
import {
  isWahaConfigured,
  prepareWahaSessionForQr,
  restartWahaSession,
} from "@/lib/integrations/waha";
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

    try {
      await restartWahaSession();
    } catch {
      await prepareWahaSessionForQr(webhookUrl || undefined);
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
