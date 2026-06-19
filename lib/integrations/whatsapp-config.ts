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
