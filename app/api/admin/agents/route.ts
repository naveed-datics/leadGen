import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, ilike } from "drizzle-orm";
import { getDb } from "@/lib/db/index";
import { users } from "@/lib/db/schema";
import { AuthError, requireRole } from "@/lib/auth/guards";
import { hashPassword } from "@/lib/auth/password";
import { normalizeCountryKey } from "@/lib/geo/cities";
import { isWahaConfigured } from "@/lib/integrations/waha";

const CreateAgentSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  region: z.string().min(1),
  active: z.boolean().optional(),
  searchEnabled: z.boolean().optional(),
  whatsAppEnabled: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    await requireRole("admin");

    const json = (await request.json()) as unknown;
    const parsed = CreateAgentSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const { name, email, password, region } = parsed.data;
    const db = getDb();

    const normalizedRegion = normalizeCountryKey(region);
    if (!normalizedRegion) {
      return NextResponse.json(
        { error: "Invalid region. Select a country from the list." },
        { status: 400 },
      );
    }

    const [conflict] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, "agent"), eq(users.region, normalizedRegion)))
      .limit(1);

    if (conflict) {
      return NextResponse.json(
        { error: `Region (${normalizedRegion}) is already assigned to another agent.` },
        { status: 409 },
      );
    }

    const passwordHash = await hashPassword(password);
    const values = {
      name: name.trim(),
      email: email.toLowerCase().trim(),
      passwordHash,
      role: "agent",
      region: normalizedRegion,
      active: parsed.data.active ?? true,
      searchEnabled: parsed.data.searchEnabled ?? true,
      whatsAppEnabled: parsed.data.whatsAppEnabled ?? false,
    } as const;

    const [created] = await db.insert(users).values(values).returning({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      region: users.region,
      active: users.active,
      searchEnabled: users.searchEnabled,
      whatsAppEnabled: users.whatsAppEnabled,
      createdAt: users.createdAt,
    });

    return NextResponse.json({
      agent: {
        ...created,
        createdAt: created.createdAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to create agent";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const ListSchema = z.object({
  q: z.string().optional(),
  region: z.string().optional(),
  active: z.enum(["true", "false"]).optional(),
});

export async function GET(request: Request) {
  try {
    await requireRole("admin");

    const url = new URL(request.url);
    const parsed = ListSchema.safeParse({
      q: url.searchParams.get("q") ?? undefined,
      region: url.searchParams.get("region") ?? undefined,
      active: url.searchParams.get("active") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query" }, { status: 400 });
    }

    const { q, region, active } = parsed.data;

    const where = and(
      eq(users.role, "agent"),
      region ? eq(users.region, region) : undefined,
      active ? eq(users.active, active === "true") : undefined,
      q
        ? and(
            ilike(users.name, `%${q}%`),
            // Note: this is AND; if we want OR, we’ll adjust later.
            ilike(users.email, `%${q}%`),
          )
        : undefined,
    );

    const db = getDb();
    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
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
      .where(where);

    return NextResponse.json({
      agents: rows.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        region: r.region,
        active: r.active,
        searchEnabled: r.searchEnabled,
        whatsAppEnabled: r.whatsAppEnabled,
        serpApiKeyConfigured: Boolean(r.serpApiKeyEnc?.trim()),
        waConfigured: isWahaConfigured(),
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to load agents";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

