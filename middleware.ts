import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authCookieName, verifyAuthToken } from "@/lib/auth/jwt";

const PUBLIC_PATHS = new Set<string>([
  "/login",
  "/api/whatsapp/waha/webhook",
  "/api/whatsapp/webhook",
]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/api/whatsapp/webhook/")) return true;
  if (pathname.startsWith("/_next")) return true;
  if (pathname.startsWith("/api/auth")) return true;
  if (pathname === "/favicon.ico") return true;
  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get(authCookieName())?.value;
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  let payload: { sub: string; role: "admin" | "agent" };
  try {
    payload = await verifyAuthToken(token);
  } catch {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/admin") && payload.role !== "admin") {
    return NextResponse.redirect(new URL("/agent", req.url));
  }

  if (pathname.startsWith("/agent") && payload.role !== "agent") {
    return NextResponse.redirect(new URL("/admin", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};

