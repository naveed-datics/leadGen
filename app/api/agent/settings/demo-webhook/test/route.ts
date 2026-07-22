import { NextResponse } from "next/server";
import { z } from "zod";
import { getAgentDemoWebhookConfig } from "@/lib/agent-settings";
import { AuthError, requireActiveAgent } from "@/lib/auth/guards";
import { testDemoWebhookConnectivity } from "@/lib/integrations/demo-webhook";

const PostSchema = z.object({
  demoWebhookUrl: z.string().optional(),
  demoWebhookApiKey: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const agent = await requireActiveAgent();
    const json = (await request.json().catch(() => ({}))) as unknown;
    const parsed = PostSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const saved = await getAgentDemoWebhookConfig(agent.id);
    const override = {
      url: parsed.data.demoWebhookUrl?.trim() || saved.url,
      apiKey: parsed.data.demoWebhookApiKey?.trim() || saved.apiKey,
    };

    const result = await testDemoWebhookConnectivity(override);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "Failed to test demo webhook";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
