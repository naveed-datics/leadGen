import { NextResponse } from "next/server";
import { authCookieName } from "@/lib/auth/jwt";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(authCookieName(), "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}

