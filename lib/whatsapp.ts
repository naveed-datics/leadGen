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

export async function checkWhatsAppExists(
  phone: string,
  agentId?: string,
): Promise<boolean> {
  const normalized = normalizePhoneForWhatsApp(phone);
  if (!normalized) return false;

  const {
    isWahaConfigured,
    checkWahaContactExists,
    getWahaConfigForAgent,
  } = await import("@/lib/integrations/waha");
  if (isWahaConfigured() && agentId) {
    try {
      const result = await checkWahaContactExists(
        getWahaConfigForAgent(agentId),
        phone,
      );
      return result.exists;
    } catch {
      return checkViaWhatsAppWeb(normalized);
    }
  }

  return checkViaWhatsAppWeb(normalized);
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

export function buildChatId(phone: string): string | null {
  const normalized = normalizePhoneForWhatsApp(phone);
  if (!normalized) return null;
  return `${normalized}@c.us`;
}

export async function sendWhatsAppMessage(
  phone: string,
  message: string,
  agentId: string,
): Promise<void> {
  const {
    isWahaConfigured,
    checkWahaContactExists,
    getWahaConfigForAgent,
    sendWahaTextMessage,
  } = await import("@/lib/integrations/waha");

  if (!isWahaConfigured()) {
    throw new Error(
      "WAHA is not configured. Add WAHA_BASE_URL to .env.local",
    );
  }

  const wahaConfig = getWahaConfigForAgent(agentId);
  const { exists, chatId } = await checkWahaContactExists(wahaConfig, phone);
  if (!exists || !chatId) {
    throw new Error("This number is not on WhatsApp");
  }

  await sendWahaTextMessage(wahaConfig, { chatId, text: message });
}

export { isWahaConfigured } from "@/lib/integrations/waha";
