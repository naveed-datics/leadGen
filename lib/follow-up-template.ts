export interface FollowUpTemplateInput {
  businessName: string;
  demoUrl?: string | null;
  competitorName?: string | null;
  competitorUrl?: string | null;
}

export const DEFAULT_FOLLOW_UP_DAY3_TEMPLATE = `Hi {{businessName}}! Just checking in — did you get a chance to see the demo?
{{demoUrl}}`;

export const DEFAULT_FOLLOW_UP_DAY7_TEMPLATE = `Hi {{businessName}}! One last thing — here's what a nearby competitor's site looks like vs. what yours could look like:

Competitor: {{competitorName}} — {{competitorUrl}}
Your demo: {{demoUrl}}`;

function applyPlaceholders(
  template: string,
  values: Record<string, string>,
): string {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    result = result.split(`{{${key}}}`).join(value);
  }
  return result;
}

function trimEmptyLines(text: string): string {
  return text
    .split("\n")
    .filter((line, index, lines) => {
      const trimmed = line.trim();
      if (trimmed) return true;
      const prev = lines[index - 1]?.trim();
      const next = lines[index + 1]?.trim();
      return Boolean(prev && next);
    })
    .join("\n")
    .trim();
}

export function buildFollowUpDay3Message(input: FollowUpTemplateInput): string {
  const demoUrl = input.demoUrl?.trim() ?? "";
  let message = applyPlaceholders(DEFAULT_FOLLOW_UP_DAY3_TEMPLATE, {
    businessName: input.businessName,
    demoUrl,
  });
  if (!demoUrl) {
    message = message.replace(/\n?\{\{demoUrl\}\}/g, "").trim();
  }
  return trimEmptyLines(message);
}

export function buildFollowUpDay7Message(input: FollowUpTemplateInput): string | null {
  const competitorName = input.competitorName?.trim() ?? "";
  const competitorUrl = input.competitorUrl?.trim() ?? "";
  const demoUrl = input.demoUrl?.trim() ?? "";

  if (!competitorName || !competitorUrl) {
    return null;
  }

  let message = applyPlaceholders(DEFAULT_FOLLOW_UP_DAY7_TEMPLATE, {
    businessName: input.businessName,
    competitorName,
    competitorUrl,
    demoUrl,
  });

  if (!demoUrl) {
    message = message.replace(/\nYour demo: \{\{demoUrl\}\}/g, "").trim();
  }

  return trimEmptyLines(message);
}
