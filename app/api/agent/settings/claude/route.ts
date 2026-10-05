import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireActiveAgent } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/index";
import { users } from "@/lib/db/schema";
import { encryptSecret } from "@/lib/integrations/crypto";
import {
  ClaudeRoutineError,
  validateRoutineUrl,
} from "@/lib/integrations/claude-routine";

const settingsColumns = {
  claudeRoutineUrl: users.claudeRoutineUrl,
  claudeRoutineTokenEnc: users.claudeRoutineTokenEnc,
  claudeBetaHeader: users.claudeBetaHeader,
  claudeDryRun: users.claudeDryRun,
  demoProvider: users.demoProvider,
};

function toResponse(row: {
  claudeRoutineUrl: string | null;
  claudeRoutineTokenEnc: string | null;
  claudeBetaHeader: string | null;
  claudeDryRun: boolean;
  demoProvider: string;
} | undefined) {
  const claudeConfigured = Boolean(
    row?.claudeRoutineUrl && row?.claudeRoutineTokenEnc,
  );
  return {
    claudeRoutineUrl: row?.claudeRoutineUrl ?? null,
    claudeBetaHeader: row?.claudeBetaHeader ?? null,
    claudeDryRun: row?.claudeDryRun ?? true,
    claudeTokenConfigured: Boolean(row?.claudeRoutineTokenEnc),
    claudeConfigured,
    demoProvider: row?.demoProvider === "claude" ? "claude" : "demoapp",
  };
}

export async function GET() {
  try {
    const agent = await requireActiveAgent();
    const [row] = await getDb()
      .select(settingsColumns)
      .from(users)
      .where(eq(users.id, agent.id))
      .limit(1);
    return NextResponse.json(toResponse(row));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "Failed to load Claude settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const PutSchema = z.object({
  claudeRoutineUrl: z.string().optional(),
  claudeRoutineToken: z.string().optional(),
  claudeBetaHeader: z.string().optional(),
  claudeDryRun: z.boolean().optional(),
  demoProvider: z.enum(["demoapp", "claude"]).optional(),
});

export async function PUT(request: Request) {
  try {
    const agent = await requireActiveAgent();
    const parsed = PutSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const db = getDb();
    const [current] = await db
      .select(settingsColumns)
      .from(users)
      .where(eq(users.id, agent.id))
      .limit(1);

    const patch: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };

    if (parsed.data.claudeRoutineUrl !== undefined) {
      const trimmed = parsed.data.claudeRoutineUrl.trim();
      patch.claudeRoutineUrl = trimmed ? validateRoutineUrl(trimmed) : null;
    }
    if (parsed.data.claudeRoutineToken?.trim()) {
      patch.claudeRoutineTokenEnc = encryptSecret(parsed.data.claudeRoutineToken);
    }
    if (parsed.data.claudeBetaHeader !== undefined) {
      patch.claudeBetaHeader = parsed.data.claudeBetaHeader.trim() || null;
    }

    if (parsed.data.claudeDryRun !== undefined) {
      patch.claudeDryRun = parsed.data.claudeDryRun;
    }

    const nextUrl =
      patch.claudeRoutineUrl !== undefined
        ? patch.claudeRoutineUrl
        : current?.claudeRoutineUrl;
    const nextToken =
      patch.claudeRoutineTokenEnc ?? current?.claudeRoutineTokenEnc;
    const willBeConfigured = Boolean(nextUrl && nextToken);

    if (parsed.data.demoProvider === "claude" && !willBeConfigured) {
      return NextResponse.json(
        { error: "Save a Claude endpoint and token before selecting Claude." },
        { status: 400 },
      );
    }
    if (parsed.data.demoProvider) {
      patch.demoProvider = parsed.data.demoProvider;
    } else if (!willBeConfigured && current?.demoProvider === "claude") {
      patch.demoProvider = "demoapp";
    }

    const [updated] = await db
      .update(users)
      .set(patch)
      .where(eq(users.id, agent.id))
      .returning(settingsColumns);

    return NextResponse.json({ ok: true, ...toResponse(updated) });
  } catch (error) {
    if (error instanceof AuthError || error instanceof ClaudeRoutineError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "Failed to save Claude settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
