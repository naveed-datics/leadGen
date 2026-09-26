import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/index";
import { users } from "@/lib/db/schema";
import { AuthError } from "@/lib/auth/guards";
import {
  bearerToken,
  hashExtensionToken,
  tokensMatch,
} from "./token";

export interface ExtensionAgent {
  id: string;
  name: string;
  fbDailyCap: number;
}

/** Authenticates an extension request by its per-agent bearer token. */
export async function requireExtensionAgent(
  request: Request,
): Promise<ExtensionAgent> {
  const token = bearerToken(request.headers.get("authorization"));
  if (!token) throw new AuthError("Missing extension token", 401);

  const db = getDb();
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      role: users.role,
      active: users.active,
      socialMessagingEnabled: users.socialMessagingEnabled,
      fbDailyCap: users.fbDailyCap,
      extensionTokenHash: users.extensionTokenHash,
    })
    .from(users)
    .where(eq(users.extensionTokenHash, hashExtensionToken(token)));

  if (!user || !tokensMatch(token, user.extensionTokenHash)) {
    throw new AuthError("Invalid extension token", 401);
  }
  if (user.role !== "agent" || !user.active) {
    throw new AuthError("Account is inactive", 403);
  }
  if (!user.socialMessagingEnabled) {
    throw new AuthError("Social messaging is not enabled for this account", 403);
  }
  return { id: user.id, name: user.name, fbDailyCap: user.fbDailyCap };
}

export function extensionErrorResponse(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "Request failed";
  return NextResponse.json({ error: message }, { status: 500 });
}
