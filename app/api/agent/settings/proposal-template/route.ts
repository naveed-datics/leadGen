import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { AuthError, requireActiveAgent } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/index";
import { users } from "@/lib/db/schema";
import { DEFAULT_PROPOSAL_TEMPLATE } from "@/lib/proposal-template";

const MAX_TEMPLATE_LENGTH = 8000;

export async function GET() {
  try {
    const agent = await requireActiveAgent();
    const db = getDb();

    const [row] = await db
      .select({ proposalTemplate: users.proposalTemplate })
      .from(users)
      .where(eq(users.id, agent.id))
      .limit(1);

    return NextResponse.json({
      template: row?.proposalTemplate ?? null,
      defaultTemplate: DEFAULT_PROPOSAL_TEMPLATE,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "Failed to load proposal template";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const agent = await requireActiveAgent();
    const json = (await request.json()) as { template?: string | null };

    if (!("template" in json)) {
      return NextResponse.json({ error: "template is required" }, { status: 400 });
    }

    const template = json.template;
    if (template !== null && typeof template !== "string") {
      return NextResponse.json({ error: "Invalid template" }, { status: 400 });
    }

    if (template && template.length > MAX_TEMPLATE_LENGTH) {
      return NextResponse.json(
        { error: `Template must be at most ${MAX_TEMPLATE_LENGTH} characters` },
        { status: 400 },
      );
    }

    const normalized =
      template === null || template.trim().length === 0 ? null : template;

    const db = getDb();
    await db
      .update(users)
      .set({ proposalTemplate: normalized, updatedAt: new Date() })
      .where(eq(users.id, agent.id));

    return NextResponse.json({
      ok: true,
      template: normalized,
      defaultTemplate: DEFAULT_PROPOSAL_TEMPLATE,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "Failed to save proposal template";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
