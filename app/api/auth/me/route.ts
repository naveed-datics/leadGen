import { NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth/guards";

export async function GET() {
  try {
    const user = await requireAuth();
    return NextResponse.json({
      user: {
        id: user.id,
        role: user.role,
        name: user.name,
        email: user.email,
        region: user.region,
        active: user.active,
        searchEnabled: user.searchEnabled,
        whatsAppEnabled: user.whatsAppEnabled,
        serpApiKeyConfigured: user.serpApiKeyConfigured,
        waConfigured: user.waConfigured,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

