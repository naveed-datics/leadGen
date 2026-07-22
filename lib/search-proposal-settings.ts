import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/index";
import { searches, users } from "@/lib/db/schema";
import { DEFAULT_PROPOSAL_TEMPLATE } from "@/lib/proposal-template";
import { isWordPressConfigured } from "@/lib/integrations/wordpress";

export async function getSearchSettings(searchId: string, agentId: string) {
  const db = getDb();

  const [row] = await db
    .select({
      searchTemplate: searches.proposalTemplate,
      searchDemoEnabled: searches.demoEnabled,
      searchDefaultDemoPageId: searches.defaultDemoPageId,
      demoTemplate: searches.demoTemplate,
      industry: searches.industry,
      location: searches.location,
      query: searches.query,
      agentTemplate: users.proposalTemplate,
      agentDemoEnabled: users.demoEnabled,
      agentDefaultDemoPageId: users.defaultDemoPageId,
      wpBaseUrl: users.wpBaseUrl,
      wpUsername: users.wpUsername,
      wpAppPasswordEnc: users.wpAppPasswordEnc,
    })
    .from(searches)
    .leftJoin(users, eq(searches.agentId, users.id))
    .where(and(eq(searches.id, searchId), eq(searches.agentId, agentId)))
    .limit(1);

  if (!row) return null;

  const agentTemplate = row.agentTemplate?.trim() || null;
  const searchTemplate = row.searchTemplate?.trim() || null;
  const effectiveTemplate =
    searchTemplate ?? agentTemplate ?? DEFAULT_PROPOSAL_TEMPLATE;

  const wpConfigured = isWordPressConfigured(
    row.wpBaseUrl,
    row.wpUsername,
    row.wpAppPasswordEnc,
  );

  const effectiveDemoPageId =
    row.searchDefaultDemoPageId ?? row.agentDefaultDemoPageId ?? null;

  return {
    template: searchTemplate,
    agentTemplate,
    defaultTemplate: DEFAULT_PROPOSAL_TEMPLATE,
    effectiveTemplate,
    industry: row.industry,
    location: row.location,
    query: row.query,
    demoEnabled: row.searchDemoEnabled,
    defaultDemoPageId: row.searchDefaultDemoPageId,
    effectiveDemoPageId,
    demoTemplate: row.demoTemplate?.trim() || null,
    wpConfigured,
    agentDemoEnabled: row.agentDemoEnabled,
  };
}

export async function getEffectiveProposalTemplateForSearch(
  searchId: string,
  agentId: string,
): Promise<string | null> {
  const settings = await getSearchSettings(searchId, agentId);
  if (!settings) return null;
  return settings.effectiveTemplate;
}

export async function getSearchDemoPageId(
  searchId: string,
  agentId: string,
): Promise<number | null> {
  const settings = await getSearchSettings(searchId, agentId);
  if (!settings?.demoEnabled) return null;
  return settings.effectiveDemoPageId;
}

/** @deprecated use getSearchSettings */
export const getSearchProposalTemplateSettings = getSearchSettings;
