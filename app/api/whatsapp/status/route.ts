import { NextResponse } from "next/server";
import { isWahaConfigured } from "@/lib/integrations/waha";

export async function GET() {
  const configured = isWahaConfigured();
  return NextResponse.json({
    checkConfigured: configured,
    sendConfigured: configured,
  });
}
