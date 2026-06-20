import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSearchSettings } from "@/lib/search-proposal-settings";
import { AuthError, requireActiveAgent } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/index";
import { searches } from "@/lib/db/schema";
import { DEFAULT_PROPOSAL_TEMPLATE } from "@/lib/proposal-template";

const MAX_TEMPLATE_LENGTH = 8000;

const PutSchema = z.object({
  template: z.string().nullable().optional(),
  demoEnabled: z.boolean().optional(),
  defaultDemoPageId: z.number().int().positive().nullable().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const agent = await requireActiveAgent();
    const settings = await getSearchSettings(id, agent.id);

    if (!settings) {
      return NextResponse.json({ error: "Search not found" }, { status: 404 });
    }

    return NextResponse.json({
      template: settings.template,
      agentTemplate: settings.agentTemplate,
      defaultTemplate: settings.defaultTemplate,
      effectiveTemplate: settings.effectiveTemplate,
      query: settings.query,
      industry: settings.industry,
      location: settings.location,
      demoEnabled: settings.demoEnabled,
      defaultDemoPageId: settings.defaultDemoPageId,
      effectiveDemoPageId: settings.effectiveDemoPageId,
      wpConfigured: settings.wpConfigured,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "Failed to load search settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const agent = await requireActiveAgent();
    const json = (await request.json()) as unknown;
    const parsed = PutSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const { template, demoEnabled, defaultDemoPageId } = parsed.data;

    if (
      template === undefined &&
      demoEnabled === undefined &&
      defaultDemoPageId === undefined
    ) {
      return NextResponse.json({ error: "No settings provided" }, { status: 400 });
    }

    if (template !== undefined && template !== null && template.length > MAX_TEMPLATE_LENGTH) {
      return NextResponse.json(
        { error: `Template must be at most ${MAX_TEMPLATE_LENGTH} characters` },
        { status: 400 },
      );
    }

    const patch: Partial<typeof searches.$inferInsert> = {};

    if (template !== undefined) {
      patch.proposalTemplate =
        template === null || template.trim().length === 0 ? null : template;
    }
    if (demoEnabled !== undefined) {
      patch.demoEnabled = demoEnabled;
    }
    if (defaultDemoPageId !== undefined) {
      patch.defaultDemoPageId = defaultDemoPageId;
    }

    const db = getDb();
    const [updated] = await db
      .update(searches)
      .set(patch)
      .where(and(eq(searches.id, id), eq(searches.agentId, agent.id)))
      .returning({ id: searches.id });

    if (!updated) {
      return NextResponse.json({ error: "Search not found" }, { status: 404 });
    }

    const settings = await getSearchSettings(id, agent.id);

    return NextResponse.json({
      ok: true,
      template: settings?.template ?? null,
      agentTemplate: settings?.agentTemplate ?? null,
      defaultTemplate: DEFAULT_PROPOSAL_TEMPLATE,
      effectiveTemplate: settings?.effectiveTemplate ?? DEFAULT_PROPOSAL_TEMPLATE,
      demoEnabled: settings?.demoEnabled ?? false,
      defaultDemoPageId: settings?.defaultDemoPageId ?? null,
      effectiveDemoPageId: settings?.effectiveDemoPageId ?? null,
      wpConfigured: settings?.wpConfigured ?? false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "Failed to save search settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
