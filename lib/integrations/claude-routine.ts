import { createHmac, timingSafeEqual } from "node:crypto";
import { placeIdToGbpUrl } from "@/lib/integrations/demo-webhook";

const ANTHROPIC_HOST = "api.anthropic.com";
const ROUTINE_PATH = /^\/v1\/claude_code\/routines\/[A-Za-z0-9_-]+\/fire$/;
const FIRE_TIMEOUT_MS = 30_000;
/** Beta flag the routine fire endpoint currently requires. */
export const DEFAULT_ROUTINE_BETA = "experimental-cc-routine-2026-04-01";

export class ClaudeRoutineError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ClaudeRoutineError";
  }
}

export type ClaudeRoutineConfig = {
  url: string;
  token: string;
  betaHeader: string | null;
};

export type ClaudeJobLead = {
  placeId: string;
  name: string;
  category?: string | null;
  address?: string | null;
  phone?: string | null;
};

/** Only allow the Anthropic routine fire endpoint (SSRF guard for saved URLs). */
export function validateRoutineUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new ClaudeRoutineError("Endpoint must be a valid URL", 400);
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== ANTHROPIC_HOST) {
    throw new ClaudeRoutineError(`Endpoint must be on https://${ANTHROPIC_HOST}`, 400);
  }
  if (!ROUTINE_PATH.test(parsed.pathname)) {
    throw new ClaudeRoutineError(
      "Endpoint must look like /v1/claude_code/routines/<id>/fire",
      400,
    );
  }
  return parsed.toString();
}

function callbackSecret(): string {
  const secret = process.env.INTEGRATIONS_MASTER_KEY;
  if (!secret || secret.trim().length < 32) {
    throw new Error("INTEGRATIONS_MASTER_KEY must be set and at least 32 characters");
  }
  return secret;
}

/**
 * Origin Claude should call back. `CLAUDE_CALLBACK_BASE_URL` (a public URL,
 * e.g. an ngrok tunnel) overrides the request origin, which is unreachable
 * from Anthropic when LeadGen runs on localhost.
 */
export function resolveCallbackBase(requestUrl: string): string {
  const override = process.env.CLAUDE_CALLBACK_BASE_URL?.trim();
  return override || new URL(requestUrl).origin;
}

const ROUTINE_SUCCESS_STATUSES = new Set([
  "completed",
  "complete",
  "done",
  "success",
  "succeeded",
  "ready",
  "ok",
  "published",
]);

const ROUTINE_FAILURE_STATUSES = new Set(["failed", "error"]);

/** True when the routine's callback reports the demo site was finished. */
export function isRoutineSuccess(status: unknown): boolean {
  return (
    typeof status === "string" &&
    ROUTINE_SUCCESS_STATUSES.has(status.trim().toLowerCase())
  );
}

/** True when the routine's callback reports it failed after starting. */
export function isRoutineFailure(status: unknown): boolean {
  return (
    typeof status === "string" &&
    ROUTINE_FAILURE_STATUSES.has(status.trim().toLowerCase())
  );
}

export function signJobId(jobId: string): string {
  return createHmac("sha256", callbackSecret())
    .update(`claude-demo:${jobId}`)
    .digest("hex");
}

export function verifyJobSignature(jobId: string, sig: string): boolean {
  const expected = Buffer.from(signJobId(jobId));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function buildClaudeJob(input: {
  jobId: string;
  demoUrl: string;
  callbackBaseUrl: string;
  dryRun: boolean;
  lead: ClaudeJobLead;
}) {
  const callback = new URL("/api/webhooks/claude-demo", input.callbackBaseUrl);
  callback.searchParams.set("job", input.jobId);
  callback.searchParams.set("sig", signJobId(input.jobId));

  return {
    job_id: input.jobId,
    gbp_url: placeIdToGbpUrl(input.lead.placeId),
    demo_url: input.demoUrl,
    competitors: [] as string[],
    options: {
      dry_run: input.dryRun,
      callback_url: callback.toString(),
      gbp_data: {
        verified: {
          name: input.lead.name,
          category: input.lead.category ?? "",
          address: input.lead.address ?? "",
          phone: input.lead.phone ?? "",
          hours: "",
        },
        reviews: [] as unknown[],
      },
    },
  };
}

export async function fireClaudeRoutine(
  config: ClaudeRoutineConfig,
  job: ReturnType<typeof buildClaudeJob>,
): Promise<unknown> {
  const url = validateRoutineUrl(config.url);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.token.replace(/^Bearer\s+/i, "").trim()}`,
    "Content-Type": "application/json",
    "anthropic-version": "2023-06-01",
    "anthropic-beta": config.betaHeader?.trim() || DEFAULT_ROUTINE_BETA,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FIRE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ text: JSON.stringify(job) }),
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => null)) as
      | { error?: { message?: string }; message?: string }
      | null;
    if (!res.ok) {
      throw new ClaudeRoutineError(
        data?.error?.message || data?.message || `Claude routine failed (${res.status})`,
        res.status === 401 || res.status === 403 ? 400 : 502,
      );
    }
    return data;
  } catch (error) {
    if (error instanceof ClaudeRoutineError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ClaudeRoutineError("Claude routine request timed out", 504);
    }
    throw new ClaudeRoutineError(
      error instanceof Error ? error.message : "Claude routine request failed",
      502,
    );
  } finally {
    clearTimeout(timeout);
  }
}
