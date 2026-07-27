import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/index";
import { users } from "@/lib/db/schema";
import { decryptSecret } from "@/lib/integrations/crypto";
import {
  isWordPressConfigured,
  normalizeWordPressBaseUrl,
} from "@/lib/integrations/wordpress";

export type AgentWordPressCredentials = {
  baseUrl: string;
  username: string;
  appPassword: string;
  defaultDemoPageId: number | null;
  demoEnabled: boolean;
};

export async function getAgentWordPressSettings(agentId: string) {
  const db = getDb();
  const [row] = await db
    .select({
      demoEnabled: users.demoEnabled,
      wpBaseUrl: users.wpBaseUrl,
      wpUsername: users.wpUsername,
      wpAppPasswordEnc: users.wpAppPasswordEnc,
      defaultDemoPageId: users.defaultDemoPageId,
    })
    .from(users)
    .where(eq(users.id, agentId))
    .limit(1);

  if (!row) return null;

  return {
    demoEnabled: row.demoEnabled,
    wpConfigured: isWordPressConfigured(
      row.wpBaseUrl,
      row.wpUsername,
      row.wpAppPasswordEnc,
    ),
    defaultDemoPageId: row.defaultDemoPageId,
    wpBaseUrl: row.wpBaseUrl,
    wpUsername: row.wpUsername,
  };
}

export async function getAgentWordPressCredentials(
  agentId: string,
): Promise<AgentWordPressCredentials | null> {
  const db = getDb();
  const [row] = await db
    .select({
      demoEnabled: users.demoEnabled,
      wpBaseUrl: users.wpBaseUrl,
      wpUsername: users.wpUsername,
      wpAppPasswordEnc: users.wpAppPasswordEnc,
      defaultDemoPageId: users.defaultDemoPageId,
    })
    .from(users)
    .where(eq(users.id, agentId))
    .limit(1);

  if (
    !row ||
    !isWordPressConfigured(
      row.wpBaseUrl,
      row.wpUsername,
      row.wpAppPasswordEnc,
    )
  ) {
    return null;
  }

  return {
    demoEnabled: row.demoEnabled,
    baseUrl: normalizeWordPressBaseUrl(row.wpBaseUrl!),
    username: row.wpUsername!,
    appPassword: decryptSecret(row.wpAppPasswordEnc!),
    defaultDemoPageId: row.defaultDemoPageId,
  };
}

export async function getAgentDemoWebhookConfig(
  agentId: string,
): Promise<{ url: string | null; apiKey: string | null }> {
  const db = getDb();
  const [row] = await db
    .select({
      demoWebhookUrl: users.demoWebhookUrl,
      demoWebhookApiKeyEnc: users.demoWebhookApiKeyEnc,
    })
    .from(users)
    .where(eq(users.id, agentId))
    .limit(1);

  return {
    url: row?.demoWebhookUrl ?? null,
    apiKey: row?.demoWebhookApiKeyEnc
      ? decryptSecret(row.demoWebhookApiKeyEnc)
      : null,
  };
}

/**
 * Callback secret an agent expects on inbound POSTs to /api/webhooks/demo-url.
 * Defaults to the agent's demo webhook API key when no explicit callback
 * secret has been set, so agents only need to configure one value unless
 * they want the callback secret to differ from the outbound API key.
 */
export async function getAgentDemoUrlWebhookSecret(
  agentId: string,
): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({
      demoUrlWebhookSecretEnc: users.demoUrlWebhookSecretEnc,
      demoWebhookApiKeyEnc: users.demoWebhookApiKeyEnc,
    })
    .from(users)
    .where(eq(users.id, agentId))
    .limit(1);

  if (row?.demoUrlWebhookSecretEnc) {
    return decryptSecret(row.demoUrlWebhookSecretEnc);
  }
  if (row?.demoWebhookApiKeyEnc) {
    return decryptSecret(row.demoWebhookApiKeyEnc);
  }
  return null;
}

export function serializeProposal(proposal: {
  id: string;
  status: string;
  body: string;
  sentAt: Date | null;
  repliedAt: Date | null;
  demoUrl?: string | null;
  demoStatus?: string | null;
}) {
  return {
    id: proposal.id,
    status: proposal.status,
    body: proposal.body,
    sentAt: proposal.sentAt?.toISOString() ?? null,
    repliedAt: proposal.repliedAt?.toISOString() ?? null,
    demoUrl: proposal.demoUrl ?? null,
    demoStatus: proposal.demoStatus ?? "none",
  };
}
