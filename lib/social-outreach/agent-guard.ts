import { AuthError, requireActiveAgent } from "@/lib/auth/guards";
import type { CurrentUser } from "@/lib/auth/guards";

export async function requireSocialAgent(): Promise<CurrentUser> {
  const user = await requireActiveAgent();
  if (!user.socialMessagingEnabled) {
    throw new AuthError("Social messaging is not enabled for this account", 403);
  }
  return user;
}
