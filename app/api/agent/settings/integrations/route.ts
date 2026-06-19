import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { AuthError, requireActiveAgent } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/index";
import { users } from "@/lib/db/schema";
import { encryptSecret } from "@/lib/integrations/crypto";
import { isWahaConfigured } from "@/lib/integrations/waha";

const PutSchema = z.object({
  serpApiKey: z.string().min(1).optional(),
});

export async function PUT(request: Request) {
  try {
    const agent = await requireActiveAgent();

    const json = (await request.json()) as unknown;
    const parsed = PutSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const hasAny = Object.values(parsed.data).some(
      (v) => typeof v === "string" && v.trim().length > 0,
    );
    if (!hasAny) {
      return NextResponse.json(
        { error: "No settings provided" },
        { status: 400 },
      );
    }

    const db = getDb();

    const patch: Partial<typeof users.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (parsed.data.serpApiKey?.trim()) {
      patch.serpApiKeyEnc = encryptSecret(parsed.data.serpApiKey);
    }

    const [updated] = await db
      .update(users)
      .set(patch)
      .where(eq(users.id, agent.id))
      .returning({
        serpApiKeyEnc: users.serpApiKeyEnc,
        whatsAppEnabled: users.whatsAppEnabled,
      });

    return NextResponse.json({
      ok: true,
      integrations: {
        serpApiKeyConfigured: Boolean(updated.serpApiKeyEnc?.trim()),
        waConfigured: isWahaConfigured(),
        whatsAppEnabled: updated.whatsAppEnabled,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to update settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

