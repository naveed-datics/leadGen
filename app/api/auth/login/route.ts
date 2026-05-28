import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/index";
import { users } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { authCookieName, signAuthToken } from "@/lib/auth/jwt";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  let json: unknown;
  if (contentType.includes("application/json")) {
    try {
      json = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
  } else {
    // Support HTML form posts from /login.
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: "Invalid form body" }, { status: 400 });
    }
    json = {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    };
  }

  const parsed = LoginSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 400 });
  }

  const { email, password } = parsed.data;

  const db = getDb();
  const [user] = await db
    .select({
      id: users.id,
      passwordHash: users.passwordHash,
      role: users.role,
      active: users.active,
    })
    .from(users)
    .where(eq(users.email, email.toLowerCase().trim()));

  if (!user) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const role = user.role === "admin" ? "admin" : user.role === "agent" ? "agent" : null;
  if (!role) {
    return NextResponse.json({ error: "Invalid account role" }, { status: 401 });
  }

  if (role === "agent" && !user.active) {
    return NextResponse.json({ error: "Account is inactive" }, { status: 403 });
  }

  const token = await signAuthToken({ sub: user.id, role });

  // If this came from an HTML form, redirect to the appropriate dashboard.
  const wantsRedirect =
    !contentType.includes("application/json") &&
    contentType.includes("application/x-www-form-urlencoded");

  const response = wantsRedirect
    ? NextResponse.redirect(new URL(role === "admin" ? "/admin/agents" : "/agent/settings", request.url))
    : NextResponse.json({ ok: true });
  response.cookies.set(authCookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return response;
}

