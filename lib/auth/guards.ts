import { cookies } from "next/headers";
import { getDb } from "@/lib/db/index";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { isWahaConfigured } from "@/lib/integrations/waha";
import type { AuthRole } from "./jwt";
import { authCookieName, verifyAuthToken } from "./jwt";

export type CurrentUser = {
  id: string;
  role: AuthRole;
  name: string;
  email: string;
  region: string | null;
  active: boolean;
  searchEnabled: boolean;
  whatsAppEnabled: boolean;
  serpApiKeyConfigured: boolean;
  waConfigured: boolean;
};

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export async function requireAuth(): Promise<CurrentUser> {
  const cookieStore = await cookies();
  const token = cookieStore.get(authCookieName())?.value;
  if (!token) throw new AuthError("Not authenticated", 401);

  let payload: { sub: string; role: AuthRole };
  try {
    payload = await verifyAuthToken(token);
  } catch {
    throw new AuthError("Invalid session", 401);
  }

  const db = getDb();
  const [user] = await db
    .select({
      id: users.id,
      role: users.role,
      name: users.name,
      email: users.email,
      region: users.region,
      active: users.active,
      searchEnabled: users.searchEnabled,
      whatsAppEnabled: users.whatsAppEnabled,
      serpApiKeyEnc: users.serpApiKeyEnc,
    })
    .from(users)
    .where(eq(users.id, payload.sub));

  if (!user) throw new AuthError("User not found", 401);

  const role = user.role === "admin" ? "admin" : user.role === "agent" ? "agent" : null;
  if (!role) throw new AuthError("Invalid user role", 401);

  return {
    id: user.id,
    role,
    name: user.name,
    email: user.email,
    region: user.region ?? null,
    active: user.active,
    searchEnabled: user.searchEnabled,
    whatsAppEnabled: user.whatsAppEnabled,
    serpApiKeyConfigured: Boolean(user.serpApiKeyEnc?.trim()),
    waConfigured: isWahaConfigured(),
  };
}

export async function requireRole(role: AuthRole): Promise<CurrentUser> {
  const user = await requireAuth();
  if (user.role !== role) throw new AuthError("Forbidden", 403);
  return user;
}

export async function requireActiveAgent(): Promise<CurrentUser> {
  const user = await requireRole("agent");
  if (!user.active) throw new AuthError("Account is inactive", 403);
  if (!user.region) throw new AuthError("Agent region is not assigned", 403);
  return user;
}

