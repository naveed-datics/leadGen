import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireActiveAgent } from "@/lib/auth/guards";
import { isUniqueViolation, serializeIndustry } from "@/lib/db/industry-helpers";
import { getDb } from "@/lib/db/index";
import { industries } from "@/lib/db/schema";
import { normalizeIndustryName } from "@/lib/industries";

const UpdateIndustrySchema = z.object({
  name: z.string().min(1).max(120),
});

const IndustryIdSchema = z.string().uuid();

type RouteContext = { params: Promise<{ id: string }> };

async function parseIndustryId(context: RouteContext): Promise<
  { ok: true; id: string } | { ok: false; response: NextResponse }
> {
  const { id } = await context.params;
  const parsed = IndustryIdSchema.safeParse(id);
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid industry id" }, { status: 400 }),
    };
  }
  return { ok: true, id: parsed.data };
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const agent = await requireActiveAgent();
    const idResult = await parseIndustryId(context);
    if (!idResult.ok) return idResult.response;
    const { id } = idResult;

    const json = (await request.json()) as unknown;
    const parsed = UpdateIndustrySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Industry name is required" }, { status: 400 });
    }

    const name = parsed.data.name.trim().replace(/\s+/g, " ");
    const nameNormalized = normalizeIndustryName(name);
    if (!nameNormalized) {
      return NextResponse.json({ error: "Industry name is required" }, { status: 400 });
    }

    const db = getDb();
    const [owned] = await db
      .select({ id: industries.id })
      .from(industries)
      .where(and(eq(industries.id, id), eq(industries.agentId, agent.id)))
      .limit(1);

    if (!owned) {
      return NextResponse.json({ error: "Industry not found" }, { status: 404 });
    }

    const [conflict] = await db
      .select({ id: industries.id })
      .from(industries)
      .where(
        and(
          eq(industries.agentId, agent.id),
          eq(industries.nameNormalized, nameNormalized),
        ),
      )
      .limit(1);

    if (conflict && conflict.id !== id) {
      return NextResponse.json(
        { error: "You already have an industry with this name." },
        { status: 409 },
      );
    }

    try {
      const [updated] = await db
        .update(industries)
        .set({
          name,
          nameNormalized,
          updatedAt: new Date(),
        })
        .where(and(eq(industries.id, id), eq(industries.agentId, agent.id)))
        .returning({
          id: industries.id,
          name: industries.name,
          nameNormalized: industries.nameNormalized,
          createdAt: industries.createdAt,
          updatedAt: industries.updatedAt,
        });

      if (!updated) {
        return NextResponse.json({ error: "Industry not found" }, { status: 404 });
      }

      return NextResponse.json({ industry: serializeIndustry(updated) });
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
    const message = error instanceof Error ? error.message : "Failed to update industry";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const agent = await requireActiveAgent();
    const idResult = await parseIndustryId(context);
    if (!idResult.ok) return idResult.response;
    const { id } = idResult;

    const db = getDb();
    const deleted = await db
      .delete(industries)
      .where(and(eq(industries.id, id), eq(industries.agentId, agent.id)))
      .returning({ id: industries.id });

    if (deleted.length === 0) {
      return NextResponse.json({ error: "Industry not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to delete industry";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
