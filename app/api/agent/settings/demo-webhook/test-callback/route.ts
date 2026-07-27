import { NextResponse } from "next/server";
import { AuthError, requireActiveAgent } from "@/lib/auth/guards";

interface TestCallbackBody {
  leadId?: unknown;
  demoUrl?: unknown;
}

/**
 * Session-authed proxy so agents can test the inbound demo-url webhook from
 * the settings UI without the DEMO_URL_WEBHOOK_SECRET ever reaching the browser.
 */
export async function POST(request: Request) {
  try {
    await requireActiveAgent();

    const secret = process.env.DEMO_URL_WEBHOOK_SECRET?.trim();
    if (!secret) {
      return NextResponse.json(
        { error: "DEMO_URL_WEBHOOK_SECRET is not configured on the server." },
        { status: 500 },
      );
    }

    let body: TestCallbackBody;
    try {
      body = (await request.json()) as TestCallbackBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { leadId, demoUrl } = body;
    if (typeof leadId !== "string" || !leadId.trim()) {
      return NextResponse.json({ error: "leadId is required" }, { status: 400 });
    }
    if (typeof demoUrl !== "string" || !demoUrl.trim()) {
      return NextResponse.json({ error: "demoUrl is required" }, { status: 400 });
    }

    const origin = new URL(request.url).origin;
    const res = await fetch(`${origin}/api/webhooks/demo-url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": secret,
      },
      body: JSON.stringify({ leadId: leadId.trim(), demoUrl: demoUrl.trim() }),
    });

    const text = await res.text().catch(() => "");
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    return NextResponse.json(
      {
        status: res.status,
        response: data,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "Failed to call demo-url webhook";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
