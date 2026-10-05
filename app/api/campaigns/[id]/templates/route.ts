import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAgentWordPressCredentials } from "@/lib/agent-settings";
import { AuthError, requireActiveAgent } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/index";
import { campaigns } from "@/lib/db/schema";
import { WpNetworkError, wpListTemplates } from "@/lib/integrations/wp-network";

/** GET /api/campaigns/{id}/templates — WP template sites the agent can pick. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const agent = await requireActiveAgent();
    const { id } = await params;

    const [campaign] = await getDb()
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(and(eq(campaigns.id, id), eq(campaigns.agentId, agent.id)))
      .limit(1);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const wp = await getAgentWordPressCredentials(agent.id);
    if (!wp) {
      return NextResponse.json(
        { error: "Connect your WordPress website in Settings first." },
        { status: 400 },
      );
    }

    const templates = await wpListTemplates(wp);
    return NextResponse.json({
      templates: templates.map((t) => ({ id: t.id, title: t.title, slug: t.slug, url: t.url })),
    });
  } catch (error) {
    if (error instanceof AuthError || error instanceof WpNetworkError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "Failed to load templates";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
