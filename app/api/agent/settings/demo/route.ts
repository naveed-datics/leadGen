import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAgentWordPressSettings } from "@/lib/agent-settings";
import { AuthError, requireActiveAgent } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/index";
import { users } from "@/lib/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/integrations/crypto";
import {
  isWordPressConfigured,
  normalizeWordPressBaseUrl,
  testWordPressConnection,
} from "@/lib/integrations/wordpress";

export async function GET() {
  try {
    const agent = await requireActiveAgent();
    const settings = await getAgentWordPressSettings(agent.id);

    return NextResponse.json({
      demoEnabled: settings?.demoEnabled ?? false,
      wpConfigured: settings?.wpConfigured ?? false,
      defaultDemoPageId: settings?.defaultDemoPageId ?? null,
      wpBaseUrl: settings?.wpBaseUrl ?? null,
      wpUsername: settings?.wpUsername ?? null,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "Failed to load demo settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const PutSchema = z.object({
  demoEnabled: z.boolean().optional(),
  wpBaseUrl: z.string().optional(),
  wpUsername: z.string().optional(),
  wpAppPassword: z.string().optional(),
  defaultDemoPageId: z.number().int().positive().nullable().optional(),
});

export async function PUT(request: Request) {
  try {
    const agent = await requireActiveAgent();
    const json = (await request.json()) as unknown;
    const parsed = PutSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const db = getDb();
    const [existing] = await db
      .select({
        wpBaseUrl: users.wpBaseUrl,
        wpUsername: users.wpUsername,
        wpAppPasswordEnc: users.wpAppPasswordEnc,
      })
      .from(users)
      .where(eq(users.id, agent.id))
      .limit(1);

    const patch: Partial<typeof users.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (typeof parsed.data.demoEnabled === "boolean") {
      patch.demoEnabled = parsed.data.demoEnabled;
    }

    if (parsed.data.wpBaseUrl !== undefined) {
      const trimmed = parsed.data.wpBaseUrl.trim();
      patch.wpBaseUrl = trimmed ? normalizeWordPressBaseUrl(trimmed) : null;
    }

    if (parsed.data.wpUsername !== undefined) {
      const trimmed = parsed.data.wpUsername.trim();
      patch.wpUsername = trimmed || null;
    }

    if (parsed.data.wpAppPassword?.trim()) {
      patch.wpAppPasswordEnc = encryptSecret(parsed.data.wpAppPassword);
    }

    if (parsed.data.defaultDemoPageId !== undefined) {
      patch.defaultDemoPageId = parsed.data.defaultDemoPageId;
    }

    const nextBaseUrl = patch.wpBaseUrl ?? existing?.wpBaseUrl;
    const nextUsername = patch.wpUsername ?? existing?.wpUsername;
    const nextPasswordEnc =
      patch.wpAppPasswordEnc ?? existing?.wpAppPasswordEnc;

    const willValidate =
      parsed.data.wpBaseUrl !== undefined ||
      parsed.data.wpUsername !== undefined ||
      parsed.data.wpAppPassword !== undefined;

    if (
      willValidate &&
      isWordPressConfigured(nextBaseUrl, nextUsername, nextPasswordEnc)
    ) {
      await testWordPressConnection(
        nextBaseUrl!,
        nextUsername!,
        decryptSecret(nextPasswordEnc!),
      );
    }

    const [updated] = await db
      .update(users)
      .set(patch)
      .where(eq(users.id, agent.id))
      .returning({
        demoEnabled: users.demoEnabled,
        wpBaseUrl: users.wpBaseUrl,
        wpUsername: users.wpUsername,
        wpAppPasswordEnc: users.wpAppPasswordEnc,
        defaultDemoPageId: users.defaultDemoPageId,
      });

    return NextResponse.json({
      ok: true,
      demoEnabled: updated.demoEnabled,
      wpConfigured: isWordPressConfigured(
        updated.wpBaseUrl,
        updated.wpUsername,
        updated.wpAppPasswordEnc,
      ),
      defaultDemoPageId: updated.defaultDemoPageId,
      wpBaseUrl: updated.wpBaseUrl,
      wpUsername: updated.wpUsername,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "Failed to save demo settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
