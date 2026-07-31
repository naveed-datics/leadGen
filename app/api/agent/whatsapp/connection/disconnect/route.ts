import { NextResponse } from "next/server";
import { AuthError, requireActiveAgent } from "@/lib/auth/guards";
import {
  getWahaConfigForAgent,
  isWahaConfigured,
  logoutWahaSession,
} from "@/lib/integrations/waha";

export async function POST() {
  try {
    const agent = await requireActiveAgent();

    if (!isWahaConfigured()) {
      return NextResponse.json(
        { error: "WAHA is not configured on this server" },
        { status: 503 },
      );
    }

    await logoutWahaSession(getWahaConfigForAgent(agent.id));

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "Failed to disconnect session";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
