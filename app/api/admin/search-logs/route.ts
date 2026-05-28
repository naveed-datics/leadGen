import { NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { AuthError, requireRole } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/index";
import { searchActivityLogs, users } from "@/lib/db/schema";

const QuerySchema = z.object({
  agentId: z.string().uuid().optional(),
  region: z.string().min(1).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

function parseDateOrNull(value?: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(request: Request) {
  try {
    await requireRole("admin");

    const url = new URL(request.url);
    const parsed = QuerySchema.safeParse({
      agentId: url.searchParams.get("agentId") ?? undefined,
      region: url.searchParams.get("region") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid filters" }, { status: 400 });
    }

    const fromDate = parseDateOrNull(parsed.data.from);
    const toDate = parseDateOrNull(parsed.data.to);
    if ((parsed.data.from && !fromDate) || (parsed.data.to && !toDate)) {
      return NextResponse.json({ error: "Invalid date filter" }, { status: 400 });
    }

    const where = and(
      parsed.data.agentId ? eq(searchActivityLogs.agentId, parsed.data.agentId) : undefined,
      parsed.data.region ? eq(searchActivityLogs.region, parsed.data.region) : undefined,
      fromDate ? gte(searchActivityLogs.createdAt, fromDate) : undefined,
      toDate ? lte(searchActivityLogs.createdAt, toDate) : undefined,
    );

    const db = getDb();
    const rows = await db
      .select({
        id: searchActivityLogs.id,
        query: searchActivityLogs.query,
        region: searchActivityLogs.region,
        createdAt: searchActivityLogs.createdAt,
        agentId: users.id,
        agentName: users.name,
        agentEmail: users.email,
      })
      .from(searchActivityLogs)
      .innerJoin(users, eq(users.id, searchActivityLogs.agentId))
      .where(where)
      .orderBy(desc(searchActivityLogs.createdAt))
      .limit(500);

    return NextResponse.json({
      logs: rows.map((r) => ({
        id: r.id,
        query: r.query,
        region: r.region,
        timestamp: r.createdAt.toISOString(),
        agent: { id: r.agentId, name: r.agentName, email: r.agentEmail },
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to load logs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

