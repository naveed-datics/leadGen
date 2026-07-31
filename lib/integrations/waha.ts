import { buildChatId, normalizePhoneForWhatsApp } from "@/lib/whatsapp";

export type WahaConfig = {
  baseUrl: string;
  apiKey?: string;
  session: string;
};

export function isWahaConfigured(): boolean {
  return Boolean(process.env.WAHA_BASE_URL?.trim());
}

/** Stable per-agent WAHA session name on the shared server. */
export function wahaSessionForAgent(agentId: string): string {
  return `agent_${agentId}`;
}

/** Parse agent id from session name `agent_<uuid>`. */
export function agentIdFromWahaSession(session?: string | null): string | undefined {
  const name = session?.trim() ?? "";
  if (!name.startsWith("agent_")) return undefined;
  const id = name.slice("agent_".length);
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  ) {
    return id;
  }
  return undefined;
}

export function getWahaConfigForAgent(agentId: string): WahaConfig {
  const baseUrl = process.env.WAHA_BASE_URL?.trim()?.replace(/\/$/, "");
  if (!baseUrl) {
    throw new Error("WAHA is not configured. Set WAHA_BASE_URL in .env.local");
  }
  const apiKey = process.env.WAHA_API_KEY?.trim() || undefined;
  return {
    baseUrl,
    apiKey,
    session: wahaSessionForAgent(agentId),
  };
}

function getWahaHeaders(config: WahaConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey) {
    headers["X-Api-Key"] = config.apiKey;
  }
  return headers;
}

export async function wahaFetch(
  config: WahaConfig,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = `${config.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  try {
    return await fetch(url, {
      ...init,
      headers: {
        ...getWahaHeaders(config),
        ...(init?.headers ?? {}),
      },
      signal: init?.signal ?? AbortSignal.timeout(15_000),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "network error";
    throw new Error(`Could not reach WAHA at ${config.baseUrl}: ${reason}`);
  }
}

type CheckExistsResponse = {
  numberExists?: boolean;
  chatId?: string;
};

export async function checkWahaContactExists(
  config: WahaConfig,
  phone: string,
): Promise<{ exists: boolean; chatId: string | null }> {
  const normalized = normalizePhoneForWhatsApp(phone);
  if (!normalized) return { exists: false, chatId: null };

  if (!isWahaConfigured()) {
    throw new Error("WAHA is not configured");
  }

  const params = new URLSearchParams({
    phone: normalized,
    session: config.session,
  });

  const response = await wahaFetch(
    config,
    `/api/contacts/check-exists?${params.toString()}`,
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `WAHA check failed (${response.status}): ${text || response.statusText}`,
    );
  }

  const data = (await response.json()) as CheckExistsResponse;
  return {
    exists: Boolean(data.numberExists),
    chatId: data.chatId?.trim() ?? buildChatId(phone),
  };
}

type SendTextResponse = {
  id?: string;
  key?: { id?: string };
};

export async function sendWahaTextMessage(
  config: WahaConfig,
  input: {
    chatId: string;
    text: string;
  },
): Promise<{ waMessageId: string | null }> {
  const response = await wahaFetch(config, "/api/sendText", {
    method: "POST",
    body: JSON.stringify({
      session: config.session,
      chatId: input.chatId,
      text: input.text,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `WAHA send failed (${response.status}): ${text || response.statusText}`,
    );
  }

  const data = (await response.json().catch(() => null)) as SendTextResponse | null;
  const waMessageId = data?.id ?? data?.key?.id ?? null;
  return { waMessageId };
}

export type WahaChatHistoryMessage = {
  id?: string;
  timestamp?: number;
  from?: string;
  fromMe?: boolean;
  body?: string;
  hasMedia?: boolean;
};

/** Pull recent messages from WAHA for a chat (used to recover missed webhooks). */
export async function fetchWahaChatMessages(
  config: WahaConfig,
  input: {
    chatId: string;
    limit?: number;
  },
): Promise<WahaChatHistoryMessage[]> {
  const limit = input.limit ?? 50;
  const params = new URLSearchParams({
    limit: String(limit),
    downloadMedia: "false",
  });

  const response = await wahaFetch(
    config,
    `/api/${encodeURIComponent(config.session)}/chats/${encodeURIComponent(input.chatId)}/messages?${params}`,
  );
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `WAHA get messages failed (${response.status}): ${text || response.statusText}`,
    );
  }

  const data = (await response.json().catch(() => null)) as unknown;
  if (!Array.isArray(data)) return [];
  return data as WahaChatHistoryMessage[];
}

type WahaLidLookupResponse = {
  lid?: string;
  pn?: string | null;
};

function phoneFromPnChatId(chatId: string): string | null {
  const localPart = chatId.split("@")[0]?.trim() ?? "";
  if (!localPart) return null;
  return normalizePhoneForWhatsApp(localPart) ?? localPart;
}

/** Map WAHA chat id (@c.us, @s.whatsapp.net, or @lid) to normalized phone digits. */
export async function resolveWahaChatIdToPhone(
  config: WahaConfig,
  chatId: string,
): Promise<string | null> {
  const trimmed = chatId.trim();
  if (!trimmed) return null;

  const [localPart, suffix = ""] = trimmed.split("@");
  if (!localPart) return null;

  if (suffix === "c.us" || suffix === "s.whatsapp.net") {
    return phoneFromPnChatId(trimmed);
  }

  if (suffix === "lid") {
    const response = await wahaFetch(
      config,
      `/api/${encodeURIComponent(config.session)}/lids/${encodeURIComponent(localPart)}`,
    );
    if (!response.ok) return null;

    const data = (await response.json().catch(() => null)) as WahaLidLookupResponse | null;
    const pn = data?.pn?.trim();
    if (!pn) return null;
    return phoneFromPnChatId(pn);
  }

  return normalizePhoneForWhatsApp(localPart) ?? localPart;
}

export type WahaSessionStatus =
  | "STOPPED"
  | "STARTING"
  | "SCAN_QR_CODE"
  | "WORKING"
  | "FAILED"
  | string;

type WahaSessionResponse = {
  name?: string;
  status?: WahaSessionStatus;
  me?: { id?: string; pushName?: string };
};

type WahaMeResponse = {
  id?: string;
  pushName?: string;
};

type WahaQrJsonResponse = {
  mimetype?: string;
  data?: string;
  error?: string;
  message?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type WahaWebhookConfig = {
  url: string;
  events: string[];
  customHeaders?: Array<{ name: string; value: string }>;
};

type WahaSessionConfig = {
  webhooks?: WahaWebhookConfig[];
};

function buildSessionConfig(webhookUrl?: string): WahaSessionConfig | undefined {
  if (!webhookUrl) return undefined;

  const webhook: WahaWebhookConfig = {
    url: webhookUrl,
    events: ["message", "message.any", "message.ack"],
  };

  const secret = process.env.WAHA_WEBHOOK_SECRET?.trim();
  if (secret) {
    webhook.customHeaders = [{ name: "X-Webhook-Secret", value: secret }];
  }

  return { webhooks: [webhook] };
}

export async function syncWahaSessionWebhook(
  config: WahaConfig,
  webhookUrl?: string,
): Promise<void> {
  const sessionConfig = buildSessionConfig(webhookUrl);
  if (!sessionConfig) {
    throw new Error(
      "Webhook URL is not configured. Open Settings while deployed or set WAHA_WEBHOOK_BASE_URL.",
    );
  }

  const response = await wahaFetch(
    config,
    `/api/sessions/${encodeURIComponent(config.session)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        name: config.session,
        config: sessionConfig,
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to register WAHA webhooks (${response.status}): ${text || response.statusText}`,
    );
  }
}

export async function getWahaSessionWebhookUrls(
  config: WahaConfig,
): Promise<string[]> {
  const response = await wahaFetch(
    config,
    `/api/sessions/${encodeURIComponent(config.session)}`,
  );
  if (!response.ok) return [];

  const data = (await response.json()) as {
    config?: { webhooks?: Array<{ url?: string }> };
  };

  return (data.config?.webhooks ?? [])
    .map((hook) => hook.url?.trim() ?? "")
    .filter(Boolean);
}

export function getWahaDashboardUrl(): string | null {
  const base = process.env.WAHA_BASE_URL?.trim()?.replace(/\/$/, "");
  if (!base) return null;
  return `${base}/dashboard`;
}

export async function getWahaSessionInfo(config: WahaConfig): Promise<{
  name: string;
  status: WahaSessionStatus;
  me: { id: string; pushName: string } | null;
}> {
  const response = await wahaFetch(
    config,
    `/api/sessions/${encodeURIComponent(config.session)}`,
  );
  if (response.status === 404) {
    return { name: config.session, status: "STOPPED", me: null };
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `WAHA session lookup failed (${response.status}): ${text || response.statusText}`,
    );
  }
  const data = (await response.json()) as WahaSessionResponse;
  const me = data.me?.id
    ? {
        id: data.me.id,
        pushName: data.me.pushName?.trim() || data.me.id.split("@")[0] || "WhatsApp",
      }
    : null;
  return {
    name: data.name ?? config.session,
    status: data.status ?? "STOPPED",
    me,
  };
}

export async function getWahaSessionMe(
  config: WahaConfig,
): Promise<{
  id: string;
  pushName: string;
} | null> {
  const response = await wahaFetch(
    config,
    `/api/sessions/${encodeURIComponent(config.session)}/me`,
  );
  if (response.status === 404) return null;
  if (!response.ok) return null;

  const text = await response.text();
  if (!text.trim()) return null;

  let data: WahaMeResponse;
  try {
    data = JSON.parse(text) as WahaMeResponse;
  } catch {
    return null;
  }

  if (!data.id) return null;
  return {
    id: data.id,
    pushName: data.pushName?.trim() || data.id.split("@")[0] || "WhatsApp",
  };
}

export async function getWahaQrCodeBase64(
  config: WahaConfig,
): Promise<string | null> {
  const response = await wahaFetch(
    config,
    `/api/${encodeURIComponent(config.session)}/auth/qr`,
    {
      headers: { Accept: "application/json" },
    },
  );
  if (!response.ok) {
    const text = await response.text();
    let message = text;
    try {
      const err = JSON.parse(text) as WahaQrJsonResponse;
      message = err.error ?? err.message ?? text;
    } catch {
      // keep raw text
    }
    throw new Error(message || `QR unavailable (${response.status})`);
  }
  const data = (await response.json()) as WahaQrJsonResponse;
  if (!data.data) return null;
  const mime = data.mimetype ?? "image/png";
  return `data:${mime};base64,${data.data}`;
}

export async function prepareWahaSessionForQr(
  config: WahaConfig,
  webhookUrl?: string,
): Promise<WahaSessionStatus> {
  const sessionConfig = buildSessionConfig(webhookUrl);
  const lookup = await wahaFetch(
    config,
    `/api/sessions/${encodeURIComponent(config.session)}`,
  );

  if (lookup.status === 404) {
    const create = await wahaFetch(config, "/api/sessions", {
      method: "POST",
      body: JSON.stringify({
        name: config.session,
        start: true,
        config: sessionConfig,
      }),
    });
    if (!create.ok) {
      const text = await create.text();
      throw new Error(
        `Failed to create WAHA session (${create.status}): ${text || create.statusText}`,
      );
    }
  } else if (lookup.ok) {
    const current = (await lookup.json()) as WahaSessionResponse;
    if (webhookUrl) {
      await syncWahaSessionWebhook(config, webhookUrl);
    }
    if (current.status === "STOPPED" || current.status === "FAILED") {
      const start = await wahaFetch(
        config,
        `/api/sessions/${encodeURIComponent(config.session)}/start`,
        { method: "POST" },
      );
      if (!start.ok) {
        const text = await start.text();
        throw new Error(
          `Failed to start WAHA session (${start.status}): ${text || start.statusText}`,
        );
      }
    }
  } else {
    const text = await lookup.text();
    throw new Error(
      `WAHA session lookup failed (${lookup.status}): ${text || lookup.statusText}`,
    );
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const info = await getWahaSessionInfo(config);
    if (info.status === "SCAN_QR_CODE" || info.status === "WORKING") {
      return info.status;
    }
    await sleep(1000);
  }

  const final = await getWahaSessionInfo(config);
  return final.status;
}

export async function fetchWahaQrCodeWithRetry(
  config: WahaConfig,
  maxAttempts = 8,
): Promise<string | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const qr = await getWahaQrCodeBase64(config);
      if (qr) return qr;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("Session") && message.includes("WORKING")) {
        throw error;
      }
      if (attempt === maxAttempts - 1) throw error;
    }
    await sleep(1000);
  }
  return null;
}

export async function ensureWahaSessionStarted(
  config: WahaConfig,
  webhookUrl?: string,
): Promise<void> {
  const lookup = await wahaFetch(
    config,
    `/api/sessions/${encodeURIComponent(config.session)}`,
  );
  const sessionConfig = buildSessionConfig(webhookUrl);

  if (lookup.status === 404) {
    await wahaFetch(config, "/api/sessions", {
      method: "POST",
      body: JSON.stringify({
        name: config.session,
        start: true,
        config: sessionConfig,
      }),
    });
    return;
  }

  if (webhookUrl) {
    await syncWahaSessionWebhook(config, webhookUrl);
  }

  const info = lookup.ok
    ? ((await lookup.json()) as WahaSessionResponse)
    : null;
  if (info?.status === "STOPPED" || info?.status === "FAILED") {
    await wahaFetch(
      config,
      `/api/sessions/${encodeURIComponent(config.session)}/start`,
      { method: "POST" },
    );
  }
}

export async function restartWahaSession(config: WahaConfig): Promise<void> {
  const response = await wahaFetch(
    config,
    `/api/sessions/${encodeURIComponent(config.session)}/restart`,
    { method: "POST" },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `WAHA restart failed (${response.status}): ${text || response.statusText}`,
    );
  }
}

export async function logoutWahaSession(config: WahaConfig): Promise<void> {
  const response = await wahaFetch(
    config,
    `/api/sessions/${encodeURIComponent(config.session)}/logout`,
    { method: "POST" },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `WAHA logout failed (${response.status}): ${text || response.statusText}`,
    );
  }
}

export async function startWahaSession(
  config: WahaConfig,
  webhookUrl?: string,
): Promise<void> {
  await ensureWahaSessionStarted(config, webhookUrl);
  const response = await wahaFetch(
    config,
    `/api/sessions/${encodeURIComponent(config.session)}/start`,
    { method: "POST" },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `WAHA start failed (${response.status}): ${text || response.statusText}`,
    );
  }
}
