import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/index";
import { businessContacts, searchBusinesses, searches } from "@/lib/db/schema";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { id } = await context.params;
    const db = getDb();

    const [business] = await db
      .select({ id: searchBusinesses.id })
      .from(searchBusinesses)
      .innerJoin(searches, eq(searchBusinesses.searchId, searches.id))
      .where(
        and(
          eq(searchBusinesses.id, id),
          user.role === "agent" ? eq(searches.agentId, user.id) : undefined,
        ),
      )
      .limit(1);

    if (!business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    const contacts = await db
      .select({
        id: businessContacts.id,
        name: businessContacts.name,
        jobTitle: businessContacts.jobTitle,
        linkedinUrl: businessContacts.linkedinUrl,
        email: businessContacts.email,
        emailConfidence: businessContacts.emailConfidence,
        phone: businessContacts.phone,
        source: businessContacts.source,
      })
      .from(businessContacts)
      .where(eq(businessContacts.searchBusinessId, id))
      .orderBy(asc(businessContacts.createdAt));

    return NextResponse.json({ contacts });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "Failed to load contacts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
