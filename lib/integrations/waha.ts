import { buildChatId, normalizePhoneForWhatsApp } from "@/lib/whatsapp";

export function isWahaConfigured(): boolean {
  return Boolean(process.env.WAHA_BASE_URL?.trim());
}

export function getWahaSession(): string {
  return process.env.WAHA_SESSION?.trim() || "default";
}

function getWahaBaseUrl(): string {
  const base = process.env.WAHA_BASE_URL?.trim();
  if (!base) {
    throw new Error("WAHA is not configured. Set WAHA_BASE_URL in .env.local");
  }
  return base.replace(/\/$/, "");
}

function getWahaHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const apiKey = process.env.WAHA_API_KEY?.trim();
  if (apiKey) {
    headers["X-Api-Key"] = apiKey;
  }
  return headers;
}

export async function wahaFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = `${getWahaBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  try {
    return await fetch(url, {
      ...init,
      headers: {
        ...getWahaHeaders(),
        ...(init?.headers ?? {}),
      },
      signal: init?.signal ?? AbortSignal.timeout(15_000),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "network error";
    throw new Error(`Could not reach WAHA at ${getWahaBaseUrl()}: ${reason}`);
  }
}

type CheckExistsResponse = {
  numberExists?: boolean;
  chatId?: string;
};

export async function checkWahaContactExists(
  phone: string,
): Promise<{ exists: boolean; chatId: string | null }> {
  const normalized = normalizePhoneForWhatsApp(phone);
  if (!normalized) return { exists: false, chatId: null };

  if (!isWahaConfigured()) {
    throw new Error("WAHA is not configured");
  }

  const params = new URLSearchParams({
    phone: normalized,
    session: getWahaSession(),
  });

  const response = await wahaFetch(
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

export async function sendWahaTextMessage(input: {
  chatId: string;
  text: string;
}): Promise<{ waMessageId: string | null }> {
  const response = await wahaFetch("/api/sendText", {
    method: "POST",
    body: JSON.stringify({
      session: getWahaSession(),
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

function buildSessionConfig(webhookUrl?: string) {
  if (!webhookUrl) return undefined;
  return {
    webhooks: [
      {
        url: webhookUrl,
        events: ["message"],
      },
    ],
  };
}

export function getWahaDashboardUrl(): string | null {
  const base = process.env.WAHA_BASE_URL?.trim()?.replace(/\/$/, "");
  if (!base) return null;
  return `${base}/dashboard`;
}

export async function getWahaSessionInfo(): Promise<{
  name: string;
  status: WahaSessionStatus;
  me: { id: string; pushName: string } | null;
}> {
  const session = getWahaSession();
  const response = await wahaFetch(`/api/sessions/${encodeURIComponent(session)}`);
  if (response.status === 404) {
    return { name: session, status: "STOPPED", me: null };
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
    name: data.name ?? session,
    status: data.status ?? "STOPPED",
    me,
  };
}

export async function getWahaSessionMe(): Promise<{
  id: string;
  pushName: string;
} | null> {
  const session = getWahaSession();
  const response = await wahaFetch(
    `/api/sessions/${encodeURIComponent(session)}/me`,
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

export async function getWahaQrCodeBase64(): Promise<string | null> {
  const session = getWahaSession();
  const response = await wahaFetch(`/api/${encodeURIComponent(session)}/auth/qr`, {
    headers: { Accept: "application/json" },
  });
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
  webhookUrl?: string,
): Promise<WahaSessionStatus> {
  const session = getWahaSession();
  const config = buildSessionConfig(webhookUrl);
  const lookup = await wahaFetch(`/api/sessions/${encodeURIComponent(session)}`);

  if (lookup.status === 404) {
    const create = await wahaFetch("/api/sessions", {
      method: "POST",
      body: JSON.stringify({
        name: session,
        start: true,
        config,
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
    if (current.status === "STOPPED" || current.status === "FAILED") {
      const start = await wahaFetch(
        `/api/sessions/${encodeURIComponent(session)}/start`,
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
    const info = await getWahaSessionInfo();
    if (info.status === "SCAN_QR_CODE" || info.status === "WORKING") {
      return info.status;
    }
    await sleep(1000);
  }

  const final = await getWahaSessionInfo();
  return final.status;
}

export async function fetchWahaQrCodeWithRetry(
  maxAttempts = 8,
): Promise<string | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const qr = await getWahaQrCodeBase64();
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

export async function ensureWahaSessionStarted(webhookUrl?: string): Promise<void> {
  const session = getWahaSession();
  const lookup = await wahaFetch(`/api/sessions/${encodeURIComponent(session)}`);
  const config = buildSessionConfig(webhookUrl);

  if (lookup.status === 404) {
    await wahaFetch("/api/sessions", {
      method: "POST",
      body: JSON.stringify({
        name: session,
        start: true,
        config,
      }),
    });
    return;
  }

  const info = lookup.ok
    ? ((await lookup.json()) as WahaSessionResponse)
    : null;
  if (info?.status === "STOPPED" || info?.status === "FAILED") {
    await wahaFetch(`/api/sessions/${encodeURIComponent(session)}/start`, {
      method: "POST",
    });
  }
}

export async function restartWahaSession(): Promise<void> {
  const session = getWahaSession();
  const response = await wahaFetch(
    `/api/sessions/${encodeURIComponent(session)}/restart`,
    { method: "POST" },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `WAHA restart failed (${response.status}): ${text || response.statusText}`,
    );
  }
}

export async function logoutWahaSession(): Promise<void> {
  const session = getWahaSession();
  const response = await wahaFetch(
    `/api/sessions/${encodeURIComponent(session)}/logout`,
    { method: "POST" },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `WAHA logout failed (${response.status}): ${text || response.statusText}`,
    );
  }
}

export async function startWahaSession(webhookUrl?: string): Promise<void> {
  const session = getWahaSession();
  await ensureWahaSessionStarted(webhookUrl);
  const response = await wahaFetch(
    `/api/sessions/${encodeURIComponent(session)}/start`,
    { method: "POST" },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `WAHA start failed (${response.status}): ${text || response.statusText}`,
    );
  }
}
