import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { AuthError, requireActiveAgent } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/index";
import { users } from "@/lib/db/schema";
import { generateExtensionToken } from "@/lib/social-outreach/token";

function errorResponse(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "Request failed";
  return NextResponse.json({ error: message }, { status: 500 });
}

/** Whether a token exists (the raw token is only ever shown at creation). */
export async function GET() {
  try {
    const user = await requireActiveAgent();
    const [row] = await getDb()
      .select({ hash: users.extensionTokenHash, cap: users.fbDailyCap })
      .from(users)
      .where(eq(users.id, user.id));
    return NextResponse.json({
      enabled: user.socialMessagingEnabled,
      hasToken: Boolean(row?.hash),
      dailyCap: row?.cap ?? 10,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Generates (or rotates) the extension token; returns it once. */
export async function POST() {
  try {
    const user = await requireActiveAgent();
    if (!user.socialMessagingEnabled) {
      return NextResponse.json(
        { error: "Social messaging is not enabled for this account" },
        { status: 403 },
      );
    }
    const { token, hash } = generateExtensionToken();
    await getDb()
      .update(users)
      .set({ extensionTokenHash: hash, updatedAt: new Date() })
      .where(eq(users.id, user.id));
    return NextResponse.json({ token });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE() {
  try {
    const user = await requireActiveAgent();
    await getDb()
      .update(users)
      .set({ extensionTokenHash: null, updatedAt: new Date() })
      .where(eq(users.id, user.id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
