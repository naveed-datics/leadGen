import { NextResponse } from "next/server";
import { isGreenApiConfigured } from "@/lib/whatsapp";

export async function GET() {
  const configured = isGreenApiConfigured();
  return NextResponse.json({
    checkConfigured: configured,
    sendConfigured: configured,
  });
}
