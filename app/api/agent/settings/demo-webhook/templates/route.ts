import { NextResponse } from "next/server";
import { getAgentDemoWebhookConfig } from "@/lib/agent-settings";
import { AuthError, requireActiveAgent } from "@/lib/auth/guards";
import { DemoWebhookError, listDemoTemplates } from "@/lib/integrations/demo-webhook";

export async function GET() {
  try {
    const agent = await requireActiveAgent();
    const webhookConfig = await getAgentDemoWebhookConfig(agent.id);
    const templates = await listDemoTemplates(webhookConfig);
    return NextResponse.json({ templates });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof DemoWebhookError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "Failed to load demo templates";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
