import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@/lib/db/index";
import { users } from "@/lib/db/schema";
import { AuthError, requireRole } from "@/lib/auth/guards";
import { normalizeCountryKey } from "@/lib/geo/cities";
import { isWahaConfigured } from "@/lib/integrations/waha";

const PatchSchema = z
  .object({
    name: z.string().min(1).optional(),
    region: z.string().min(1).optional(),
    active: z.boolean().optional(),
    searchEnabled: z.boolean().optional(),
    whatsAppEnabled: z.boolean().optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, {
    message: "At least one field must be provided",
  });

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireRole("admin");
    const { id } = await context.params;

    const db = getDb();
    const [row] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        region: users.region,
        active: users.active,
        searchEnabled: users.searchEnabled,
        whatsAppEnabled: users.whatsAppEnabled,
        serpApiKeyEnc: users.serpApiKeyEnc,
        waAccessTokenEnc: users.waAccessTokenEnc,
        waPhoneNumberId: users.waPhoneNumberId,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, id));

    if (!row || row.role !== "agent") {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    return NextResponse.json({
      agent: {
        id: row.id,
        name: row.name,
        email: row.email,
        region: row.region,
        active: row.active,
        searchEnabled: row.searchEnabled,
        whatsAppEnabled: row.whatsAppEnabled,
        serpApiKeyConfigured: Boolean(row.serpApiKeyEnc?.trim()),
        waConfigured: isWahaConfigured(),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to load agent";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireRole("admin");
    const { id } = await context.params;

    const json = (await request.json()) as unknown;
    const parsed = PatchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const db = getDb();

    let normalizedRegion: string | null = null;
    if (parsed.data.region) {
      normalizedRegion = normalizeCountryKey(parsed.data.region);
      if (!normalizedRegion) {
        return NextResponse.json(
          { error: "Invalid region. Select a country from the list." },
          { status: 400 },
        );
      }

      const [conflict] = await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.role, "agent"),
            eq(users.region, normalizedRegion),
            ne(users.id, id),
          ),
        )
        .limit(1);

      if (conflict) {
        return NextResponse.json(
          { error: `Region (${normalizedRegion}) is already assigned to another agent.` },
          { status: 409 },
        );
      }
    }

    const [updated] = await db
      .update(users)
      .set({
        ...(parsed.data.name ? { name: parsed.data.name.trim() } : null),
        ...(normalizedRegion ? { region: normalizedRegion } : null),
        ...(typeof parsed.data.active === "boolean"
          ? { active: parsed.data.active }
          : null),
        ...(typeof parsed.data.searchEnabled === "boolean"
          ? { searchEnabled: parsed.data.searchEnabled }
          : null),
        ...(typeof parsed.data.whatsAppEnabled === "boolean"
          ? { whatsAppEnabled: parsed.data.whatsAppEnabled }
          : null),
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        region: users.region,
        active: users.active,
        searchEnabled: users.searchEnabled,
        whatsAppEnabled: users.whatsAppEnabled,
        updatedAt: users.updatedAt,
      });

    if (!updated || updated.role !== "agent") {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    return NextResponse.json({
      agent: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        region: updated.region,
        active: updated.active,
        searchEnabled: updated.searchEnabled,
        whatsAppEnabled: updated.whatsAppEnabled,
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to update agent";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

