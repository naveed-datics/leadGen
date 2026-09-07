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
  googlePlacesApiKey: z.string().min(1).optional(),
  searchDataSource: z.enum(["serpapi", "google_places"]).optional(),
});

export async function PUT(request: Request) {
  try {
    const agent = await requireActiveAgent();

    const json = (await request.json()) as unknown;
    const parsed = PutSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const hasKey =
      Boolean(parsed.data.serpApiKey?.trim()) ||
      Boolean(parsed.data.googlePlacesApiKey?.trim());
    const hasSource = typeof parsed.data.searchDataSource === "string";
    if (!hasKey && !hasSource) {
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
    if (parsed.data.googlePlacesApiKey?.trim()) {
      patch.googlePlacesApiKeyEnc = encryptSecret(parsed.data.googlePlacesApiKey);
    }
    if (parsed.data.searchDataSource) {
      patch.searchDataSource = parsed.data.searchDataSource;
    }

    const [updated] = await db
      .update(users)
      .set(patch)
      .where(eq(users.id, agent.id))
      .returning({
        serpApiKeyEnc: users.serpApiKeyEnc,
        googlePlacesApiKeyEnc: users.googlePlacesApiKeyEnc,
        searchDataSource: users.searchDataSource,
        whatsAppEnabled: users.whatsAppEnabled,
      });

    return NextResponse.json({
      ok: true,
      integrations: {
        serpApiKeyConfigured: Boolean(updated.serpApiKeyEnc?.trim()),
        googlePlacesApiKeyConfigured: Boolean(
          updated.googlePlacesApiKeyEnc?.trim(),
        ),
        searchDataSource:
          updated.searchDataSource === "google_places"
            ? "google_places"
            : "serpapi",
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
