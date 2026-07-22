const REQUEST_TIMEOUT_MS = 30000;

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

export async function createDemoSite({
  googleBusinessProfileUrl,
  template,
  webhookConfig,
}: {
  googleBusinessProfileUrl: string;
  template: string;
  webhookConfig?: { url: string | null; apiKey: string | null } | null;
}): Promise<DemoWebhookResponse> {
  const config = getDemoWebhookConfig(webhookConfig);
  if (!config) {
    throw new DemoWebhookError(
      "Demo webhook is not configured. Set the webhook URL and API key in Agent Settings.",
      400,
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(config.url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-LeadGen-API-Key": config.apiKey,
      },
      body: JSON.stringify({ googleBusinessProfileUrl, template }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let message = text.slice(0, 300) || `Demo webhook failed (${res.status})`;
      try {
        const parsed = JSON.parse(text) as { message?: string; error?: string };
        message = parsed.message || parsed.error || message;
      } catch {
        // Body wasn't JSON — keep the raw text fallback.
      }
      const status = res.status === 401 || res.status === 403 ? res.status : 502;
      throw new DemoWebhookError(message, status);
    }

    const data = (await res.json()) as DemoWebhookResponse;
    if (!data.ok || !data.demoUrl) {
      throw new DemoWebhookError("Demo webhook returned an unexpected response", 502);
    }

    return data;
  } catch (error) {
    if (error instanceof DemoWebhookError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new DemoWebhookError("Demo webhook request timed out", 504);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
