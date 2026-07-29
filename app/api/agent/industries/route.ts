import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireActiveAgent } from "@/lib/auth/guards";
import { isUniqueViolation, serializeIndustry } from "@/lib/db/industry-helpers";
import { getDb } from "@/lib/db/index";
import { industries } from "@/lib/db/schema";
import { normalizeIndustryName } from "@/lib/industries";

const CreateIndustrySchema = z.object({
  name: z.string().min(1).max(120),
});

export async function GET() {
  try {
    const agent = await requireActiveAgent();
    const db = getDb();
    const rows = await db
      .select({
        id: industries.id,
        name: industries.name,
        nameNormalized: industries.nameNormalized,
        createdAt: industries.createdAt,
        updatedAt: industries.updatedAt,
      })
      .from(industries)
      .where(eq(industries.agentId, agent.id))
      .orderBy(asc(industries.name));

    return NextResponse.json({
      industries: rows.map(serializeIndustry),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to load industries";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const agent = await requireActiveAgent();
    const json = (await request.json()) as unknown;
    const parsed = CreateIndustrySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Industry name is required" }, { status: 400 });
    }

    const name = parsed.data.name.trim().replace(/\s+/g, " ");
    const nameNormalized = normalizeIndustryName(name);
    if (!nameNormalized) {
      return NextResponse.json({ error: "Industry name is required" }, { status: 400 });
    }

    const db = getDb();
    const [existing] = await db
      .select({ id: industries.id })
      .from(industries)
      .where(
        and(
          eq(industries.agentId, agent.id),
          eq(industries.nameNormalized, nameNormalized),
        ),
      )
      .limit(1);

    if (existing) {
      return NextResponse.json(
        { error: "You already have an industry with this name." },
        { status: 409 },
      );
    }

    try {
      const [created] = await db
        .insert(industries)
        .values({
          agentId: agent.id,
          name,
          nameNormalized,
        })
        .returning({
          id: industries.id,
          name: industries.name,
          nameNormalized: industries.nameNormalized,
          createdAt: industries.createdAt,
          updatedAt: industries.updatedAt,
        });

      return NextResponse.json({ industry: serializeIndustry(created) }, { status: 201 });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return NextResponse.json(
          { error: "You already have an industry with this name." },
          { status: 409 },
        );
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to create industry";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
