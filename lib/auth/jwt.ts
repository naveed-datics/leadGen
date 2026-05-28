import { SignJWT, jwtVerify } from "jose";

export type AuthRole = "admin" | "agent";

export type AuthTokenPayload = {
  sub: string;
  role: AuthRole;
};

const COOKIE_NAME = "lg_auth";

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim().length < 32) {
    throw new Error("JWT_SECRET must be set and at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

export function authCookieName(): string {
  return COOKIE_NAME;
}

export async function signAuthToken(payload: AuthTokenPayload): Promise<string> {
  return new SignJWT({ role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getJwtSecret());
}

export async function verifyAuthToken(token: string): Promise<AuthTokenPayload> {
  const { payload } = await jwtVerify(token, getJwtSecret(), {
    algorithms: ["HS256"],
  });

  const sub = typeof payload.sub === "string" ? payload.sub : "";
  const role = payload.role;

  if (!sub) throw new Error("Invalid token subject");
  if (role !== "admin" && role !== "agent") throw new Error("Invalid role");

  return { sub, role };
}

