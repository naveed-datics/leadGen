import { NextResponse } from "next/server";
import { AuthError, requireActiveAgent } from "@/lib/auth/guards";
import {
  fetchWahaQrCodeWithRetry,
  isWahaConfigured,
  prepareWahaSessionForQr,
} from "@/lib/integrations/waha";
import { getWebhookUrlForAgent } from "@/lib/integrations/whatsapp-config";

export async function GET(request: Request) {
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
    const status = await prepareWahaSessionForQr(webhookUrl || undefined);

    if (status === "WORKING") {
      return NextResponse.json(
        {
          error:
            "Session is already linked. Disconnect first, then show QR code again.",
          alreadyLinked: true,
        },
        { status: 409 },
      );
    }

    const qrDataUrl = await fetchWahaQrCodeWithRetry();
    if (!qrDataUrl) {
      return NextResponse.json(
        {
          error:
            "QR code is not available yet. Wait a few seconds and try Show QR code again.",
          status,
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      qrDataUrl,
      status,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to load QR code";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
