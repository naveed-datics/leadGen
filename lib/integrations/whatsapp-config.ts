export type WhatsAppConfig = {
  qualificationEnabled: boolean;
  leadDedupeSameDay: boolean;
  promptThrottleMs: number;
  inboundAnalysisSkipRelationship: boolean;
  webhookBaseUrl: string;
};

export function getWhatsAppConfig(): WhatsAppConfig {
  const throttleRaw = Number(process.env.WHATSAPP_PROMPT_THROTTLE_MS);
  return {
    qualificationEnabled: process.env.WHATSAPP_QUALIFICATION_ENABLED !== "false",
    leadDedupeSameDay: process.env.WHATSAPP_LEAD_DEDUPE_SAME_DAY === "true",
    promptThrottleMs:
      Number.isFinite(throttleRaw) && throttleRaw > 0 ? throttleRaw : 0,
    inboundAnalysisSkipRelationship:
      process.env.INBOUND_ANALYSIS_SKIP_RELATIONSHIP === "true",
    webhookBaseUrl:
      process.env.WAHA_WEBHOOK_BASE_URL?.trim() ||
      process.env.WHATSAPP_HOOK_URL?.trim() ||
      "",
  };
}

export function getWebhookUrlForAgent(agentId: string): string {
  const base = getWhatsAppConfig().webhookBaseUrl.replace(/\/$/, "");
  if (!base) return "";
  return `${base}/${agentId}`;
}

const LOCAL_WEBHOOK_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "host.docker.internal",
]);

function hostnameFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** True when WAHA runs on a remote host but the webhook points at this machine only. */
export function isWebhookUrlUnreachableFromWaha(
  webhookUrl: string,
  wahaBaseUrl: string,
): boolean {
  if (!webhookUrl.trim()) return true;

  const webhookHost = hostnameFromUrl(webhookUrl);
  if (!webhookHost || !LOCAL_WEBHOOK_HOSTS.has(webhookHost)) return false;

  const wahaHost = hostnameFromUrl(wahaBaseUrl);
  if (!wahaHost) return false;

  return !LOCAL_WEBHOOK_HOSTS.has(wahaHost);
}
