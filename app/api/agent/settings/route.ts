import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAgentWordPressSettings } from "@/lib/agent-settings";
import { AuthError, requireActiveAgent } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/index";
import { users } from "@/lib/db/schema";
import { isWahaConfigured } from "@/lib/integrations/waha";

export async function GET() {
  try {
    const agent = await requireActiveAgent();
    const db = getDb();
    const [row] = await db
      .select({
        proposalTemplate: users.proposalTemplate,
      })
      .from(users)
      .where(eq(users.id, agent.id))
      .limit(1);

    const wpSettings = await getAgentWordPressSettings(agent.id);

    return NextResponse.json({
      agent: {
        id: agent.id,
        role: agent.role,
        name: agent.name,
        email: agent.email,
        region: agent.region,
        active: agent.active,
        searchEnabled: agent.searchEnabled,
        whatsAppEnabled: agent.whatsAppEnabled,
        serpApiKeyConfigured: agent.serpApiKeyConfigured,
        waConfigured: isWahaConfigured(),
        proposalTemplateConfigured: Boolean(row?.proposalTemplate?.trim()),
        demoEnabled: wpSettings?.demoEnabled ?? false,
        wpConfigured: wpSettings?.wpConfigured ?? false,
        defaultDemoPageId: wpSettings?.defaultDemoPageId ?? null,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
