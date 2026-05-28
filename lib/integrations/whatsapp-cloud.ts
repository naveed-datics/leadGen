export type WhatsAppCloudConfig = {
  accessToken: string;
  phoneNumberId: string;
};

type CloudSendResponse = {
  messages?: Array<{ id?: string }>;
};

const WHATSAPP_GRAPH_VERSION = "v25.0";

export async function sendWhatsAppCloudTextMessage(
  config: WhatsAppCloudConfig,
  to: string,
  body: string,
): Promise<{ waMessageId: string | null }> {
  const url = `https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${encodeURIComponent(
    config.phoneNumberId,
  )}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `WhatsApp Cloud API error (${response.status}): ${text || response.statusText}`,
    );
  }

  const data = (await response.json().catch(() => null)) as CloudSendResponse | null;
  const waMessageId = data?.messages?.[0]?.id ?? null;
  return { waMessageId };
}

export type WhatsAppTemplateBodyParam =
  | { type: "text"; text: string }
  | { type: "currency"; currency: { fallback_value: string; code: string; amount_1000: number } }
  | { type: "date_time"; date_time: { fallback_value: string } };

export async function sendWhatsAppCloudTemplateMessage(
  config: WhatsAppCloudConfig,
  to: string,
  template: {
    name: string;
    languageCode: string;
    bodyParams?: WhatsAppTemplateBodyParam[];
  },
): Promise<{ waMessageId: string | null }> {
  const url = `https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${encodeURIComponent(
    config.phoneNumberId,
  )}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: template.name,
        language: { code: template.languageCode },
        components: template.bodyParams?.length
          ? [
              {
                type: "body",
                parameters: template.bodyParams,
              },
            ]
          : undefined,
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `WhatsApp Cloud API error (${response.status}): ${text || response.statusText}`,
    );
  }

  const data = (await response.json().catch(() => null)) as CloudSendResponse | null;
  const waMessageId = data?.messages?.[0]?.id ?? null;
  return { waMessageId };
}

