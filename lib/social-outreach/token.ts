import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_PREFIX = "lgx_";

export function generateExtensionToken(): { token: string; hash: string } {
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { token, hash: hashExtensionToken(token) };
}

export function hashExtensionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tokensMatch(token: string, storedHash: string | null): boolean {
  if (!storedHash) return false;
  const a = Buffer.from(hashExtensionToken(token), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}
