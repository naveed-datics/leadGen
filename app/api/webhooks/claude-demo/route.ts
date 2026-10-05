import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/index";
import { getAgentWordPressCredentials } from "@/lib/agent-settings";
import { leads, proposals, searches } from "@/lib/db/schema";
import { wpDeleteSite, wpGetSite } from "@/lib/integrations/wp-network";
import {
  DEMO_STATUS_FAILED,
  DEMO_STATUS_READY,
  DEMO_STATUS_TEMPLATE_READY,
} from "@/lib/demo-status";
import {
  isRoutineFailure,
  isRoutineSuccess,
  verifyJobSignature,
} from "@/lib/integrations/claude-routine";

/**
 * Public callback the Claude routine POSTs to when it finishes. Authenticated
 * by the HMAC `sig` in the query string. On failure it deletes the clone; the
 * demo URL is set once the routine has been triggered.
 */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Database is not configured" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("job")?.trim() || "";
  const sig = searchParams.get("sig")?.trim() || "";
  if (!jobId || !sig || !verifyJobSignature(jobId, sig)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    status?: unknown;
  } | null;

  const db = getDb();
  const [proposal] = await db
    .select({
      id: proposals.id,
      wpSiteId: proposals.wpSiteId,
      demoStatus: proposals.demoStatus,
      agentId: searches.agentId,
    })
    .from(proposals)
    .innerJoin(leads, eq(proposals.leadId, leads.id))
    .innerJoin(searches, eq(leads.searchId, searches.id))
    .where(eq(proposals.claudeJobId, jobId))
    .limit(1);
  if (!proposal) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (isRoutineFailure(body?.status)) {
    // The routine failed after starting: remove the clone and reset the demo.
    let siteRemoved = proposal.wpSiteId == null;
    if (proposal.wpSiteId != null && proposal.agentId) {
      const wp = await getAgentWordPressCredentials(proposal.agentId);
      if (wp) {
        siteRemoved = await wpDeleteSite(wp, proposal.wpSiteId)
          .then(() => true)
          .catch(() => false);
      }
    }
    await db
      .update(proposals)
      .set({
        demoStatus: DEMO_STATUS_FAILED,
        demoUrl: null,
        ...(siteRemoved ? { wpSiteId: null, demoProvider: null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(proposals.id, proposal.id));
  }

  if (isRoutineSuccess(body?.status)) {
    // Routine finished: publish the demo URL, which enables View Demo.
    if (proposal.demoStatus === DEMO_STATUS_READY) {
      return NextResponse.json({ ok: true });
    }
    if (proposal.wpSiteId == null || !proposal.agentId) {
      return NextResponse.json({ error: "Demo site not found" }, { status: 409 });
    }

    const wp = await getAgentWordPressCredentials(proposal.agentId);
    if (!wp) {
      return NextResponse.json({ error: "WordPress is not configured" }, { status: 409 });
    }

    let demoUrl: string;
    try {
      demoUrl = (await wpGetSite(wp, proposal.wpSiteId)).url;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not read the demo site";
      return NextResponse.json({ error: message }, { status: 502 });
    }
    if (!demoUrl) {
      return NextResponse.json({ error: "Demo site has no URL" }, { status: 502 });
    }

    await db
      .update(proposals)
      .set({ demoUrl, demoStatus: DEMO_STATUS_READY, updatedAt: new Date() })
      .where(eq(proposals.id, proposal.id));
    return NextResponse.json({ ok: true, demoUrl });
  }

  // Any other status (e.g. needs_credentials): the routine did not finish the
  // site, so it stays at "template ready" and View Demo stays disabled.
  console.warn("[claude-demo] callback status did not mark the demo ready", {
    jobId,
    status: body?.status,
    currentStatus: proposal.demoStatus ?? DEMO_STATUS_TEMPLATE_READY,
  });
  return NextResponse.json({ ok: true, ready: false });
}
