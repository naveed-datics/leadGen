import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { AuthError, requireActiveAgent } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/index";
import { whatsappConversations } from "@/lib/db/schema";
import {
  getWahaDashboardUrl,
  getWahaSession,
  getWahaSessionInfo,
  getWahaSessionMe,
  getWahaSessionWebhookUrls,
  isWahaConfigured,
  syncWahaSessionWebhook,
} from "@/lib/integrations/waha";
import {
  getWebhookUrlForAgent,
  isWebhookUrlUnreachableFromWaha,
} from "@/lib/integrations/whatsapp-config";

function phoneFromWahaId(id: string): string {
  return id.split("@")[0]?.replace(/\D/g, "") || id;
}

export async function GET(request: Request) {
  try {
    const agent = await requireActiveAgent();
    const configured = isWahaConfigured();
    const origin = new URL(request.url).origin;
    const webhookUrl = getWebhookUrlForAgent(agent.id, origin);
    const dashboardUrl = getWahaDashboardUrl();

    if (!configured) {
      return NextResponse.json({
        configured: false,
        whatsAppEnabled: agent.whatsAppEnabled,
        session: getWahaSession(),
        status: "NOT_CONFIGURED",
        connected: false,
        linkedName: null,
        linkedPhone: null,
        webhookUrl,
        dashboardUrl,
        conversationCount: 0,
      });
    }

    let status = "UNKNOWN";
    let linkedName: string | null = null;
    let linkedPhone: string | null = null;
    let connected = false;

    try {
      const session = await getWahaSessionInfo();
      status = session.status;
      connected = status === "WORKING";

      const me = session.me ?? (await getWahaSessionMe().catch(() => null));
      if (me) {
        linkedName = me.pushName;
        linkedPhone = phoneFromWahaId(me.id);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load WAHA session";
      const isAuth =
        message.includes("401") || message.toLowerCase().includes("unauthorized");
      return NextResponse.json(
        {
          error: isAuth
            ? "WAHA rejected the API key. Check WAHA_API_KEY in .env.local and restart the dev server."
            : message,
        },
        { status: 502 },
      );
    }

    const db = getDb();
    const conversations = await db
      .select({ id: whatsappConversations.id })
      .from(whatsappConversations)
      .where(eq(whatsappConversations.agentId, agent.id));

    let webhookConfigured = false;
    let webhookReachabilityWarning: string | null = null;

    if (webhookUrl) {
      if (isWebhookUrlUnreachableFromWaha(webhookUrl, process.env.WAHA_BASE_URL ?? "")) {
        webhookReachabilityWarning =
          "WAHA cannot reach this webhook URL from its server. Use a public HTTPS URL (e.g. ngrok or your deployed app), not localhost or host.docker.internal.";
      }

      try {
        const registered = await getWahaSessionWebhookUrls();
        webhookConfigured = registered.includes(webhookUrl);
      } catch {
        webhookConfigured = false;
      }

      if (
        connected &&
        !webhookConfigured &&
        !webhookReachabilityWarning
      ) {
        try {
          await syncWahaSessionWebhook(webhookUrl);
          webhookConfigured = true;
        } catch {
          webhookConfigured = false;
        }
      }
    } else {
      webhookReachabilityWarning =
        "Could not determine a public app URL for inbound webhooks. Deploy the app or set WAHA_WEBHOOK_BASE_URL.";
    }

    return NextResponse.json({
      configured: true,
      whatsAppEnabled: agent.whatsAppEnabled,
      session: getWahaSession(),
      status,
      connected,
      linkedName,
      linkedPhone,
      webhookUrl,
      webhookConfigured,
      webhookReachabilityWarning,
      dashboardUrl,
      conversationCount: conversations.length,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
