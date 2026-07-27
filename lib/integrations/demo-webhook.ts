// POST returns quickly (202 + pollUrl). The build itself can take several
// minutes; we poll until ready/failed within this overall budget.
// Capped under the route's 300s maxDuration (Vercel Hobby plan limit) so this
// function returns on its own instead of being force-killed mid-poll, which
// was surfacing as a truncated/empty 200 response to the caller.
const OVERALL_TIMEOUT_MS = 260_000; // 260s, ~40s headroom under maxDuration
const POST_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 2_500;
// One tick can include an Azure OpenAI call + Elementor write — allow headroom.
const POLL_REQUEST_TIMEOUT_MS = 60_000;

export class DemoWebhookError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "DemoWebhookError";
  }
}

export type DemoWebhookResponse = {
  ok: true;
  demoUrl: string;
  siteId: number;
  leadId: string;
  businessName: string;
  template: {
    id: number;
    name: string;
    slug: string;
  };
  pagesFilled: number;
  photosUploaded: number;
  warnings: string[];
};

type DemoWebhookAccepted = {
  ok: true;
  accepted?: boolean;
  leadId: string;
  status?: string;
  pollUrl?: string;
  demoUrl?: string;
  siteId?: number;
  businessName?: string;
  template?: DemoWebhookResponse["template"];
  pagesFilled?: number;
  photosUploaded?: number;
  warnings?: string[];
  message?: string;
};

type DemoWebhookPoll = {
  ok?: boolean;
  leadId?: string;
  status?: string;
  phase?: string;
  progress?: string;
  demoUrl?: string | null;
  siteId?: number | null;
  businessName?: string;
  error?: string;
  warnings?: string[];
  message?: string;
};

export function getDemoWebhookConfig(
  override?: { url: string | null; apiKey: string | null } | null,
): { url: string; apiKey: string } | null {
  const url = override?.url?.trim();
  const apiKey = override?.apiKey?.trim();
  if (!url || !apiKey) return null;
  return { url, apiKey };
}

const TEST_TIMEOUT_MS = 10000;

export type DemoWebhookTestResult = {
  reachable: boolean;
  status: number | null;
  message: string;
};

/**
 * Connectivity-only check: confirms the URL is reachable and responds,
 * without invoking real demo generation (the webhook has no dry-run mode).
 * A response of any status still counts as "reachable" — only network-level
 * failures (DNS, timeout, refused connection) are treated as unreachable.
 */
export async function testDemoWebhookConnectivity(
  webhookConfig?: { url: string | null; apiKey: string | null } | null,
): Promise<DemoWebhookTestResult> {
  const config = getDemoWebhookConfig(webhookConfig);
  if (!config) {
    return {
      reachable: false,
      status: null,
      message: "Webhook URL and API key are required.",
    };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(config.url);
  } catch {
    return { reachable: false, status: null, message: "Webhook URL is not valid." };
  }
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return { reachable: false, status: null, message: "Webhook URL must be http(s)." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);

  try {
    const res = await fetch(config.url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-LeadGen-API-Key": config.apiKey,
      },
      body: JSON.stringify({}),
    });

    return {
      reachable: true,
      status: res.status,
      message: `Reached the webhook (HTTP ${res.status}). Auth and payload are not verified by this test.`,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { reachable: false, status: null, message: "Connection timed out." };
    }
    const message = error instanceof Error ? error.message : "Connection failed.";
    return { reachable: false, status: null, message };
  } finally {
    clearTimeout(timeout);
  }
}

export type DemoTemplate = {
  id: number;
  name: string;
  slug: string;
  url: string;
};

function buildTemplatesUrl(demoWebhookUrl: string): string {
  const origin = new URL(demoWebhookUrl).origin;
  return `${origin}/api/webhooks/templates`;
}

function resolvePollUrl(
  webhookUrl: string,
  pollUrl: string | undefined,
  leadId: string,
): string {
  if (pollUrl?.startsWith("http://") || pollUrl?.startsWith("https://")) {
    return pollUrl;
  }
  const origin = new URL(webhookUrl).origin;
  if (pollUrl?.startsWith("/")) {
    return `${origin}${pollUrl}`;
  }
  return `${origin}/api/webhooks/demo/${leadId}`;
}

function parseJson<T>(text: string): T | null {
  try {
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}

export async function listDemoTemplates(
  webhookConfig?: { url: string | null; apiKey: string | null } | null,
): Promise<DemoTemplate[]> {
  const config = getDemoWebhookConfig(webhookConfig);
  if (!config) {
    throw new DemoWebhookError(
      "Demo webhook is not configured. Set the webhook URL and API key in Agent Settings.",
      400,
    );
  }

  const templatesUrl = buildTemplatesUrl(config.url);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);

  try {
    const res = await fetch(templatesUrl, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "X-LeadGen-API-Key": config.apiKey,
      },
    });

    const text = await res.text().catch(() => "");
    const data = parseJson<{ ok?: boolean; templates?: DemoTemplate[]; message?: string }>(text) ?? {};

    if (!res.ok || !data.ok) {
      const status = res.status === 401 || res.status === 403 ? res.status : 502;
      throw new DemoWebhookError(
        data.message || `Failed to load templates (${res.status})`,
        status,
      );
    }

    return data.templates ?? [];
  } catch (error) {
    if (error instanceof DemoWebhookError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new DemoWebhookError("Templates request timed out", 504);
    }
    if (error instanceof TypeError && /fetch failed/i.test(error.message)) {
      throw new DemoWebhookError(
        `Could not reach demo templates endpoint at ${templatesUrl}. Check webhook URL host/port and ensure demoGen is running.`,
        502,
      );
    }
    throw new DemoWebhookError(
      error instanceof Error ? error.message : "Failed to load templates",
      502,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function toFinalResponse(
  accepted: DemoWebhookAccepted,
  poll: DemoWebhookPoll,
): DemoWebhookResponse {
  const demoUrl = poll.demoUrl?.trim();
  if (!demoUrl) {
    throw new DemoWebhookError("Demo webhook finished without a demo URL", 502);
  }

  return {
    ok: true,
    demoUrl,
    siteId: poll.siteId ?? accepted.siteId ?? 0,
    leadId: poll.leadId || accepted.leadId,
    businessName: poll.businessName || accepted.businessName || "",
    template: accepted.template ?? { id: 0, name: "", slug: "" },
    pagesFilled: accepted.pagesFilled ?? 0,
    photosUploaded: accepted.photosUploaded ?? 0,
    warnings: poll.warnings ?? accepted.warnings ?? [],
  };
}

async function pollUntilReady({
  pollUrl,
  apiKey,
  accepted,
  deadline,
}: {
  pollUrl: string;
  apiKey: string;
  accepted: DemoWebhookAccepted;
  deadline: number;
}): Promise<DemoWebhookResponse> {
  let consecutiveTransientErrors = 0;

  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      Math.min(POLL_REQUEST_TIMEOUT_MS, remaining),
    );

    try {
      const res = await fetch(pollUrl, {
        method: "GET",
        signal: controller.signal,
        headers: { "X-LeadGen-API-Key": apiKey },
        cache: "no-store",
      });

      const text = await res.text().catch(() => "");
      const poll = parseJson<DemoWebhookPoll>(text);

      if (!res.ok || !poll?.ok) {
        const message =
          poll?.message ||
          poll?.error ||
          (poll
            ? `Demo status check failed (${res.status})`
            : `Demo status check returned a non-JSON response (${res.status})`);
        const status = res.status === 401 || res.status === 403 ? res.status : 502;
        // Auth failures are final; other errors may be transient during long ticks.
        if (status === 401 || status === 403) {
          throw new DemoWebhookError(message, status);
        }
        consecutiveTransientErrors += 1;
        if (consecutiveTransientErrors >= 5) {
          throw new DemoWebhookError(message, status);
        }
      } else {
        consecutiveTransientErrors = 0;

        if (poll.status === "ready" || poll.status === "live") {
          return toFinalResponse(accepted, poll);
        }

        if (poll.status === "failed") {
          throw new DemoWebhookError(poll.error || poll.message || "Demo build failed", 502);
        }
      }
    } catch (error) {
      if (error instanceof DemoWebhookError) throw error;
      // A single slow tick / network blip must not fail the whole demo —
      // keep polling until the overall deadline.
      if (
        (error instanceof Error && error.name === "AbortError") ||
        (error instanceof TypeError && /fetch failed/i.test(error.message))
      ) {
        consecutiveTransientErrors += 1;
        if (consecutiveTransientErrors >= 8) {
          throw new DemoWebhookError(
            "Demo status checks keep timing out — the build may still be running. Try again in a minute.",
            504,
          );
        }
      } else {
        throw error;
      }
    } finally {
      clearTimeout(timeout);
    }

    const sleepFor = Math.min(POLL_INTERVAL_MS, Math.max(0, deadline - Date.now()));
    if (sleepFor <= 0) break;
    await new Promise((r) => setTimeout(r, sleepFor));
  }

  throw new DemoWebhookError("Demo build timed out while waiting for ready status", 504);
}

export async function createDemoSite({
  googleBusinessProfileUrl,
  template,
  leadId,
  webhookConfig,
}: {
  googleBusinessProfileUrl: string;
  template: string;
  /** Consumer lead UUID — required by demoGen when a finish callback is configured. */
  leadId: string;
  webhookConfig?: { url: string | null; apiKey: string | null } | null;
}): Promise<DemoWebhookResponse> {
  const config = getDemoWebhookConfig(webhookConfig);
  if (!config) {
    throw new DemoWebhookError(
      "Demo webhook is not configured. Set the webhook URL and API key in Agent Settings.",
      400,
    );
  }

  const deadline = Date.now() + OVERALL_TIMEOUT_MS;
  const controller = new AbortController();
  const postTimeout = setTimeout(() => controller.abort(), POST_TIMEOUT_MS);

  try {
    const res = await fetch(config.url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-LeadGen-API-Key": config.apiKey,
      },
      body: JSON.stringify({ googleBusinessProfileUrl, template, leadId }),
    });

    const text = await res.text().catch(() => "");
    const parsed = parseJson<
      DemoWebhookAccepted & { message?: string; error?: string; ok?: boolean }
    >(text);

    if (!parsed?.ok || !parsed.leadId) {
      console.error("[demo-webhook] unexpected initial response", {
        status: res.status,
        contentType: res.headers.get("content-type"),
        contentLength: res.headers.get("content-length"),
        bodyLength: text.length,
        bodyPreview: text.slice(0, 500),
      });
      const message =
        parsed?.message ||
        parsed?.error ||
        (parsed
          ? `Demo webhook failed (${res.status})`
          : `Demo webhook returned a non-JSON response (${res.status}). This usually means the request was cut off before finishing — the demo generation may still be running.`);
      const status = res.status === 401 || res.status === 403 ? res.status : 502;
      throw new DemoWebhookError(message, status);
    }

    // Async accept (202 / pollUrl) — poll until ready. Do not treat a
    // provisional URL on the accept payload as final.
    if (res.status === 202 || parsed.accepted || parsed.pollUrl) {
      // Drop the POST abort timer before the long poll loop.
      clearTimeout(postTimeout);
      const pollUrl = resolvePollUrl(config.url, parsed.pollUrl, parsed.leadId);
      return await pollUntilReady({
        pollUrl,
        apiKey: config.apiKey,
        accepted: parsed,
        deadline,
      });
    }

    // Legacy sync response (200 + demoUrl).
    if (parsed.demoUrl) {
      return {
        ok: true,
        demoUrl: parsed.demoUrl,
        siteId: parsed.siteId ?? 0,
        leadId: parsed.leadId,
        businessName: parsed.businessName || "",
        template: parsed.template ?? { id: 0, name: "", slug: "" },
        pagesFilled: parsed.pagesFilled ?? 0,
        photosUploaded: parsed.photosUploaded ?? 0,
        warnings: parsed.warnings ?? [],
      };
    }

    console.error("[demo-webhook] response missing accepted/pollUrl/demoUrl", {
      status: res.status,
      parsedKeys: Object.keys(parsed),
      bodyPreview: text.slice(0, 500),
    });
    throw new DemoWebhookError("Demo webhook returned an unexpected response", 502);
  } catch (error) {
    if (error instanceof DemoWebhookError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new DemoWebhookError("Demo webhook request timed out", 504);
    }
    throw error;
  } finally {
    clearTimeout(postTimeout);
  }
}
