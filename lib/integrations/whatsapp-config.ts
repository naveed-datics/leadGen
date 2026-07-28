const WEBHOOK_PATH = "/api/whatsapp/webhook";

export type WhatsAppConfig = {
  qualificationEnabled: boolean;
  leadDedupeSameDay: boolean;
  promptThrottleMs: number;
  inboundAnalysisSkipRelationship: boolean;
  webhookBaseUrl: string;
};

function stripTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}

/** Normalize explicit env value to .../api/whatsapp/webhook (no agent id). */
function normalizeExplicitWebhookBase(value: string): string {
  const trimmed = stripTrailingSlash(value.trim());
  if (!trimmed) return "";

  if (trimmed.endsWith(WEBHOOK_PATH)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    if (url.pathname === "" || url.pathname === "/") {
      return `${url.origin}${WEBHOOK_PATH}`;
    }
    return trimmed;
  } catch {
    return trimmed;
  }
}

/**
 * Public webhook base URL for WAHA inbound callbacks.
 * Optional override: WAHA_WEBHOOK_BASE_URL or WHATSAPP_HOOK_URL.
 * Otherwise derived from the incoming request or Vercel/host env.
 */
export function resolveWebhookBaseUrl(requestOrigin?: string): string {
  const explicit =
    process.env.WAHA_WEBHOOK_BASE_URL?.trim() ||
    process.env.WHATSAPP_HOOK_URL?.trim();
  if (explicit) {
    return normalizeExplicitWebhookBase(explicit);
  }

  if (requestOrigin?.trim()) {
    return `${stripTrailingSlash(requestOrigin.trim())}${WEBHOOK_PATH}`;
  }

  const vercelProduction = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelProduction) {
    const host = vercelProduction.replace(/^https?:\/\//, "");
    return `https://${host}${WEBHOOK_PATH}`;
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    const host = vercelUrl.replace(/^https?:\/\//, "");
    return `https://${host}${WEBHOOK_PATH}`;
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim();
  if (appUrl) {
    const origin = stripTrailingSlash(
      appUrl.includes("://") ? appUrl : `https://${appUrl}`,
    );
    try {
      const url = new URL(origin);
      return `${url.origin}${WEBHOOK_PATH}`;
    } catch {
      return `${origin}${WEBHOOK_PATH}`;
    }
  }

  return "";
}

export function getWhatsAppConfig(requestOrigin?: string): WhatsAppConfig {
  const throttleRaw = Number(process.env.WHATSAPP_PROMPT_THROTTLE_MS);
  return {
    qualificationEnabled: process.env.WHATSAPP_QUALIFICATION_ENABLED !== "false",
    leadDedupeSameDay: process.env.WHATSAPP_LEAD_DEDUPE_SAME_DAY === "true",
    promptThrottleMs:
      Number.isFinite(throttleRaw) && throttleRaw > 0 ? throttleRaw : 0,
    inboundAnalysisSkipRelationship:
      process.env.INBOUND_ANALYSIS_SKIP_RELATIONSHIP === "true",
    webhookBaseUrl: resolveWebhookBaseUrl(requestOrigin),
  };
}

export function getWebhookUrlForAgent(
  agentId: string,
  requestOrigin?: string,
): string {
  const base = resolveWebhookBaseUrl(requestOrigin).replace(/\/$/, "");
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
