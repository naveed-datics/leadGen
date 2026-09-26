export const OUTREACH_PLACEHOLDERS = [
  "{{businessName}}",
  "{{industry}}",
  "{{senderName}}",
] as const;

export const DEFAULT_OUTREACH_TEMPLATE = `Hi {{businessName}}, this is {{senderName}}. I help local {{industry}} businesses get more customers online. Would you be open to a quick chat?`;

export interface OutreachTemplateVars {
  businessName: string;
  industry: string;
  senderName: string;
}

export function renderOutreachMessage(
  template: string,
  vars: OutreachTemplateVars,
): string {
  return template
    .replaceAll("{{businessName}}", vars.businessName)
    .replaceAll("{{industry}}", vars.industry)
    .replaceAll("{{senderName}}", vars.senderName)
    .trim();
}
