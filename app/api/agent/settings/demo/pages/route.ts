import { NextResponse } from "next/server";
import { getAgentWordPressCredentials } from "@/lib/agent-settings";
import { AuthError, requireActiveAgent } from "@/lib/auth/guards";
import { listWordPressPages } from "@/lib/integrations/wordpress";

export async function GET() {
  try {
    const agent = await requireActiveAgent();
    const credentials = await getAgentWordPressCredentials(agent.id);

    if (!credentials) {
      return NextResponse.json(
        { error: "WordPress is not configured" },
        { status: 400 },
      );
    }

    const pages = await listWordPressPages(
      credentials.baseUrl,
      credentials.username,
      credentials.appPassword,
    );

    return NextResponse.json({ pages });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "Failed to list WordPress pages";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
