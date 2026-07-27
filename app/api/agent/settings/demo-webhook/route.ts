import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireActiveAgent } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/index";
import { users } from "@/lib/db/schema";
import { encryptSecret } from "@/lib/integrations/crypto";

export async function GET() {
  try {
    const agent = await requireActiveAgent();
    const db = getDb();
    const [row] = await db
      .select({
        demoWebhookUrl: users.demoWebhookUrl,
        demoWebhookApiKeyEnc: users.demoWebhookApiKeyEnc,
        demoUrlWebhookSecretEnc: users.demoUrlWebhookSecretEnc,
      })
      .from(users)
      .where(eq(users.id, agent.id))
      .limit(1);

    return NextResponse.json({
      demoWebhookUrl: row?.demoWebhookUrl ?? null,
      demoWebhookConfigured: Boolean(row?.demoWebhookApiKeyEnc),
      demoUrlWebhookSecretConfigured: Boolean(row?.demoUrlWebhookSecretEnc),
      demoUrlWebhookSecretUsesApiKeyDefault:
        !row?.demoUrlWebhookSecretEnc && Boolean(row?.demoWebhookApiKeyEnc),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "Failed to load demo webhook settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const PutSchema = z.object({
  demoWebhookUrl: z.string().optional(),
  demoWebhookApiKey: z.string().optional(),
  demoUrlWebhookSecret: z.string().optional(),
});

export async function PUT(request: Request) {
  try {
    const agent = await requireActiveAgent();
    const json = (await request.json()) as unknown;
    const parsed = PutSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const patch: Partial<typeof users.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (parsed.data.demoWebhookUrl !== undefined) {
      const trimmed = parsed.data.demoWebhookUrl.trim();
      if (trimmed) {
        try {
          const parsedUrl = new URL(trimmed);
          if (!["http:", "https:"].includes(parsedUrl.protocol)) {
            throw new Error();
          }
        } catch {
          return NextResponse.json(
            { error: "Webhook URL must be a valid http(s) URL" },
            { status: 400 },
          );
        }
      }
      patch.demoWebhookUrl = trimmed || null;
    }

    if (parsed.data.demoWebhookApiKey?.trim()) {
      patch.demoWebhookApiKeyEnc = encryptSecret(parsed.data.demoWebhookApiKey);
    }

    if (parsed.data.demoUrlWebhookSecret?.trim()) {
      patch.demoUrlWebhookSecretEnc = encryptSecret(parsed.data.demoUrlWebhookSecret);
    }

    const db = getDb();
    const [updated] = await db
      .update(users)
      .set(patch)
      .where(eq(users.id, agent.id))
      .returning({
        demoWebhookUrl: users.demoWebhookUrl,
        demoWebhookApiKeyEnc: users.demoWebhookApiKeyEnc,
        demoUrlWebhookSecretEnc: users.demoUrlWebhookSecretEnc,
      });

    return NextResponse.json({
      ok: true,
      demoWebhookUrl: updated.demoWebhookUrl,
      demoWebhookConfigured: Boolean(updated.demoWebhookApiKeyEnc),
      demoUrlWebhookSecretConfigured: Boolean(updated.demoUrlWebhookSecretEnc),
      demoUrlWebhookSecretUsesApiKeyDefault:
        !updated.demoUrlWebhookSecretEnc && Boolean(updated.demoWebhookApiKeyEnc),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "Failed to save demo webhook settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
