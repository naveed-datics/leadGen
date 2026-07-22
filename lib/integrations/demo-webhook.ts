const REQUEST_TIMEOUT_MS = 30000;

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

export function getDemoWebhookConfig(): { url: string; apiKey: string } | null {
  const url = process.env.DEMO_WEBHOOK_URL?.trim();
  const apiKey = process.env.DEMO_WEBHOOK_API_KEY?.trim();
  if (!url || !apiKey) return null;
  return { url, apiKey };
}

export async function createDemoSite({
  googleBusinessProfileUrl,
  template,
}: {
  googleBusinessProfileUrl: string;
  template: string;
}): Promise<DemoWebhookResponse> {
  const config = getDemoWebhookConfig();
  if (!config) {
    throw new Error(
      "Demo webhook is not configured. Set DEMO_WEBHOOK_URL and DEMO_WEBHOOK_API_KEY.",
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
      throw new Error(text.slice(0, 300) || `Demo webhook failed (${res.status})`);
    }

    const data = (await res.json()) as DemoWebhookResponse;
    if (!data.ok || !data.demoUrl) {
      throw new Error("Demo webhook returned an unexpected response");
    }

    return data;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Demo webhook request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
