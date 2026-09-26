import { NextResponse } from "next/server";
import { effectiveDailyCap, remainingToday } from "@/lib/social-outreach/cap";
import {
  extensionErrorResponse,
  requireExtensionAgent,
} from "@/lib/social-outreach/extension-auth";
import { countSentInWindow } from "@/lib/social-outreach/sent-count";

export async function GET(request: Request) {
  try {
    const agent = await requireExtensionAgent(request);
    const sent = await countSentInWindow(agent.id);
    return NextResponse.json({
      agentName: agent.name,
      dailyCap: effectiveDailyCap(agent.fbDailyCap),
      sentToday: sent,
      remainingToday: remainingToday(agent.fbDailyCap, sent),
      // Behaviour knobs the extension applies (all in browser-local time / ms).
      businessHours: { startHour: 9, endHour: 20 },
      betweenMessagesMs: { min: 120_000, max: 360_000 },
    });
  } catch (error) {
    return extensionErrorResponse(error);
  }
}
