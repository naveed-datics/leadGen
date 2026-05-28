const INVALID_MARKERS = [
  "phone number shared via url is invalid",
  "isn't on whatsapp",
  "is not on whatsapp",
  "not a valid phone",
  "invalid phone",
  "phone number is not valid",
];

export function normalizePhoneForWhatsApp(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  if (digits.length === 10) return `1${digits}`;
  return digits;
}

export function buildWhatsAppUrl(phone: string): string | null {
  const normalized = normalizePhoneForWhatsApp(phone);
  if (!normalized) return null;
  return `https://wa.me/${normalized}`;
}

export async function checkWhatsAppExists(phone: string): Promise<boolean> {
  const normalized = normalizePhoneForWhatsApp(phone);
  if (!normalized) return false;

  if (process.env.GREEN_API_INSTANCE_ID && process.env.GREEN_API_TOKEN) {
    return checkViaGreenApi(normalized);
  }

  return checkViaWhatsAppWeb(normalized);
}

async function checkViaGreenApi(normalizedPhone: string): Promise<boolean> {
  const instanceId = process.env.GREEN_API_INSTANCE_ID!;
  const token = process.env.GREEN_API_TOKEN!;
  const url = `https://7105.api.greenapi.com/waInstance${instanceId}/checkWhatsapp/${token}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phoneNumber: Number(normalizedPhone) }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    return checkViaWhatsAppWeb(normalizedPhone);
  }

  const data = (await response.json()) as { existsWhatsapp?: boolean };
  return Boolean(data.existsWhatsapp);
}

async function checkViaWhatsAppWeb(normalizedPhone: string): Promise<boolean> {
  const url = `https://api.whatsapp.com/send/?phone=${normalizedPhone}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(10_000),
  });

  const html = (await response.text()).toLowerCase();
  const isInvalid = INVALID_MARKERS.some((marker) => html.includes(marker));
  return !isInvalid;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const GREEN_API_BASE = "https://7105.api.greenapi.com";

export function isGreenApiConfigured(): boolean {
  return Boolean(
    process.env.GREEN_API_INSTANCE_ID?.trim() &&
      process.env.GREEN_API_TOKEN?.trim(),
  );
}

export function buildChatId(phone: string): string | null {
  const normalized = normalizePhoneForWhatsApp(phone);
  if (!normalized) return null;
  return `${normalized}@c.us`;
}

export async function sendWhatsAppMessage(
  phone: string,
  message: string,
): Promise<void> {
  if (!isGreenApiConfigured()) {
    throw new Error(
      "Green API is not configured. Add GREEN_API_INSTANCE_ID and GREEN_API_TOKEN to .env.local",
    );
  }

  const chatId = buildChatId(phone);
  if (!chatId) {
    throw new Error("Invalid phone number for WhatsApp");
  }

  const instanceId = process.env.GREEN_API_INSTANCE_ID!.trim();
  const token = process.env.GREEN_API_TOKEN!.trim();
  const url = `${GREEN_API_BASE}/waInstance${instanceId}/sendMessage/${token}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chatId, message }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `WhatsApp send failed (${response.status}): ${text || response.statusText}`,
    );
  }

  const data = (await response.json()) as { idMessage?: string; message?: string };
  if (data.message && !data.idMessage) {
    throw new Error(data.message);
  }
}
