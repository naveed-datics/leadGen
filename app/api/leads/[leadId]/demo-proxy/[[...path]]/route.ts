import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAgentDemoWebhookConfig } from "@/lib/agent-settings";
import { AuthError, requireAuth } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/index";
import { leads, proposals, searches } from "@/lib/db/schema";

// Same execution-time ceiling as the demo-trigger route — generate-text and
// apply-page/apply-content proxy calls can run long (AI generation, WP writes).
export const maxDuration = 300;

type RouteContext = { params: Promise<{ leadId: string; path?: string[] }> };

/**
 * Resolve demoGen's origin from the agent's stored webhook URL (which points
 * at a specific endpoint, e.g. https://demo.example.com/api/webhooks/demo) —
 * the proxy target is a different path on the same origin.
 */
function demoGenOrigin(webhookUrl: string): string {
  return new URL(webhookUrl).origin;
}

async function forward(
  request: Request,
  { params }: RouteContext,
  method: string,
): Promise<NextResponse> {
  const { leadId, path = [] } = await params;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Database is not configured" }, { status: 500 });
  }

  try {
    const user = await requireAuth();
    const db = getDb();

    const [leadRow] = await db
      .select({ leadId: leads.id })
      .from(leads)
      .innerJoin(searches, eq(leads.searchId, searches.id))
      .where(
        and(
          eq(leads.id, leadId),
          user.role === "agent" ? eq(searches.agentId, user.id) : undefined,
        ),
      )
      .limit(1);

    if (!leadRow) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const [proposalRow] = await db
      .select({ demoGenLeadId: proposals.demoGenLeadId })
      .from(proposals)
      .where(eq(proposals.leadId, leadId))
      .limit(1);

    if (!proposalRow?.demoGenLeadId) {
      return NextResponse.json({ error: "Demo not yet provisioned" }, { status: 409 });
    }

    // Reuses the agent's existing Demo webhook URL + API key (same demoGen
    // ApiKey model, same X-LeadGen-API-Key/x-leadgen-api-key auth already used
    // for /api/webhooks/demo) — no separate key to mint for Edit Demo.
    const webhookConfig = await getAgentDemoWebhookConfig(user.id);
    if (!webhookConfig.url || !webhookConfig.apiKey) {
      return NextResponse.json(
        { error: "Demo webhook is not configured. Set the webhook URL and API key in Agent Settings." },
        { status: 400 },
      );
    }
    const apiKey = webhookConfig.apiKey;

    // Logo upload (POST /api/me/uploads/logo) and generate-text
    // (POST /api/leads/generate-text) are NOT lead-scoped sub-routes on
    // demoGen's side — special-case both rather than nesting them under
    // /api/leads/{demoGenLeadId}/..., which doesn't resolve on demoGen.
    const isLogoUpload = path.length === 2 && path[0] === "uploads" && path[1] === "logo";
    const isGenerateText = path.length === 1 && path[0] === "generate-text";
    const origin = demoGenOrigin(webhookConfig.url);
    const targetUrl = isLogoUpload
      ? `${origin}/api/me/uploads/logo`
      : isGenerateText
        ? `${origin}/api/leads/generate-text`
        : `${origin}/api/leads/${proposalRow.demoGenLeadId}${
            path.length ? `/${path.join("/")}` : ""
          }`;

    const contentType = request.headers.get("content-type") ?? "";
    const forwardHeaders: Record<string, string> = { "x-leadgen-api-key": apiKey };

    let body: BodyInit | undefined;
    if (method !== "GET" && method !== "DELETE") {
      if (contentType.includes("multipart/form-data")) {
        // Pass FormData through as-is (logo/photo uploads) — do not set
        // Content-Type manually, fetch derives the correct multipart boundary.
        body = await request.formData();
      } else {
        forwardHeaders["content-type"] = contentType || "application/json";
        body = await request.text();
      }
    }

    const res = await fetch(targetUrl, { method, headers: forwardHeaders, body });
    const responseText = await res.text();

    return new NextResponse(responseText, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to reach demo builder";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function GET(request: Request, context: RouteContext) {
  return forward(request, context, "GET");
}

export async function POST(request: Request, context: RouteContext) {
  return forward(request, context, "POST");
}

export async function PATCH(request: Request, context: RouteContext) {
  return forward(request, context, "PATCH");
}

export async function PUT(request: Request, context: RouteContext) {
  return forward(request, context, "PUT");
}
