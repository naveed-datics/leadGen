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

export function serializeProposal(proposal: {
  id: string;
  status: string;
  body: string;
  sentAt: Date | null;
  repliedAt: Date | null;
  demoUrl?: string | null;
}) {
  return {
    id: proposal.id,
    status: proposal.status,
    body: proposal.body,
    sentAt: proposal.sentAt?.toISOString() ?? null,
    repliedAt: proposal.repliedAt?.toISOString() ?? null,
    demoUrl: proposal.demoUrl ?? null,
  };
}
