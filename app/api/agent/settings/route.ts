import { NextResponse } from "next/server";
import { AuthError, requireActiveAgent } from "@/lib/auth/guards";

export async function GET() {
  try {
    const agent = await requireActiveAgent();
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
        waConfigured: agent.waConfigured,
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

