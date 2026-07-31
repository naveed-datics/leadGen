import { and, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/lib/db/index";
import {
  proposals,
  whatsappConversations,
  whatsappMessages,
} from "@/lib/db/schema";

export type WhatsAppMessageDeliveryStatus =
  | "sent"
  | "delivered"
  | "read"
  | "failed";

type WahaAckPayload = {
  id?: string;
  from?: string;
  participant?: string | null;
  fromMe?: boolean;
  ack?: number;
  ackName?: string;
};

const STATUS_RANK: Record<WhatsAppMessageDeliveryStatus, number> = {
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 0,
};

/** Expand WAHA message ids so short key ids and full compound ids can match. */
export function expandWaMessageIds(id: string): string[] {
  const trimmed = id.trim();
  if (!trimmed) return [];

  const out = new Set<string>([trimmed]);

  // {fromMe}_{chatId}_{messageId}[_{participant}]
  const compound = trimmed.match(
    /^(true|false)_([^_]+@[^_]+)_(.+)$/i,
  );
  if (compound) {
    const messagePart = compound[3];
    out.add(messagePart);
    const shortId = messagePart.split("_")[0];
    if (shortId) out.add(shortId);
    out.add(`${compound[1]}_${compound[2]}_${shortId}`);
  }

  return [...out];
}

export function mapWahaAckToStatus(
  ack?: number,
  ackName?: string,
): WhatsAppMessageDeliveryStatus | null {
  const name = ackName?.trim().toUpperCase() ?? "";
  if (name === "ERROR" || ack === -1) return "failed";
  if (name === "PLAYED" || name === "READ" || ack === 3 || ack === 4) {
    return "read";
  }
  if (name === "DEVICE" || ack === 2) return "delivered";
  if (name === "SERVER" || ack === 1) return "sent";
  if (name === "PENDING" || ack === 0) return "sent";
  return null;
}

function shouldUpgradeStatus(
  current: string,
  next: WhatsAppMessageDeliveryStatus,
): boolean {
  if (next === "failed") {
    return current === "sent" || current === "pending";
  }
  const currentRank =
    STATUS_RANK[current as WhatsAppMessageDeliveryStatus] ?? 0;
  const nextRank = STATUS_RANK[next];
  return nextRank > currentRank;
}

async function findOutboundMessageByWaId(waMessageId: string) {
  const candidates = expandWaMessageIds(waMessageId);
  if (candidates.length === 0) return null;

  const db = getDb();
  const [exact] = await db
    .select({
      id: whatsappMessages.id,
      status: whatsappMessages.status,
      conversationId: whatsappMessages.conversationId,
      waMessageId: whatsappMessages.waMessageId,
    })
    .from(whatsappMessages)
    .where(
      and(
        eq(whatsappMessages.direction, "outbound"),
        inArray(whatsappMessages.waMessageId, candidates),
      ),
    )
    .limit(1);

  if (exact) return exact;

  // Fallback: stored id may be short while ack sends compound (or vice versa).
  const likeClauses = candidates.map(
    (candidate) =>
      sql`${whatsappMessages.waMessageId} like ${`%_${candidate}`}`,
  );
  const [fuzzy] = await db
    .select({
      id: whatsappMessages.id,
      status: whatsappMessages.status,
      conversationId: whatsappMessages.conversationId,
      waMessageId: whatsappMessages.waMessageId,
    })
    .from(whatsappMessages)
    .where(
      and(
        eq(whatsappMessages.direction, "outbound"),
        or(...likeClauses),
      ),
    )
    .limit(1);

  return fuzzy ?? null;
}

async function stampProposalDelivery(
  match: SQL,
  status: WhatsAppMessageDeliveryStatus,
  at: Date,
): Promise<void> {
  const db = getDb();
  if (status === "delivered") {
    await db
      .update(proposals)
      .set({ deliveredAt: at, updatedAt: at })
      .where(and(match, isNull(proposals.deliveredAt)));
    return;
  }

  await db
    .update(proposals)
    .set({ readAt: at, updatedAt: at })
    .where(and(match, isNull(proposals.readAt)));
  await db
    .update(proposals)
    .set({ deliveredAt: at, updatedAt: at })
    .where(and(match, isNull(proposals.deliveredAt)));
}

async function touchProposalDelivery(
  conversationId: string,
  waMessageId: string,
  status: WhatsAppMessageDeliveryStatus,
  at: Date,
): Promise<void> {
  if (status !== "delivered" && status !== "read") return;

  const db = getDb();
  const [conversation] = await db
    .select({ leadId: whatsappConversations.leadId })
    .from(whatsappConversations)
    .where(eq(whatsappConversations.id, conversationId))
    .limit(1);

  if (conversation?.leadId) {
    await stampProposalDelivery(
      eq(proposals.leadId, conversation.leadId),
      status,
      at,
    );
    return;
  }

  const candidates = expandWaMessageIds(waMessageId);
  if (candidates.length === 0) return;

  await stampProposalDelivery(
    inArray(proposals.outboundWaMessageId, candidates),
    status,
    at,
  );
}

/**
 * Apply a WAHA `message.ack` event: upgrade outbound message status and
 * stamp proposal deliveredAt / readAt when applicable.
 */
export async function handleWahaMessageAck(
  payload: WahaAckPayload | undefined,
): Promise<void> {
  if (!payload?.fromMe) return;

  const waMessageId = payload.id?.trim();
  if (!waMessageId) return;

  const nextStatus = mapWahaAckToStatus(payload.ack, payload.ackName);
  if (!nextStatus) return;

  const message = await findOutboundMessageByWaId(waMessageId);
  if (!message) {
    // Still try proposal match by outboundWaMessageId alone.
    if (nextStatus === "delivered" || nextStatus === "read") {
      await touchProposalDeliveryByWaIdOnly(waMessageId, nextStatus, new Date());
    } else {
      console.warn("[waha-ack] unmatched outbound message", {
        waMessageId,
        ack: payload.ack,
        ackName: payload.ackName,
      });
    }
    return;
  }

  if (!shouldUpgradeStatus(message.status, nextStatus)) return;

  const db = getDb();
  const now = new Date();
  await db
    .update(whatsappMessages)
    .set({ status: nextStatus })
    .where(eq(whatsappMessages.id, message.id));

  await touchProposalDelivery(
    message.conversationId,
    message.waMessageId ?? waMessageId,
    nextStatus,
    now,
  );
}

async function touchProposalDeliveryByWaIdOnly(
  waMessageId: string,
  status: WhatsAppMessageDeliveryStatus,
  at: Date,
): Promise<void> {
  const candidates = expandWaMessageIds(waMessageId);
  if (candidates.length === 0) return;

  const db = getDb();
  const before = await db
    .select({ id: proposals.id })
    .from(proposals)
    .where(inArray(proposals.outboundWaMessageId, candidates))
    .limit(1);

  if (before.length === 0) {
    console.warn("[waha-ack] unmatched outbound message", { waMessageId });
    return;
  }

  await stampProposalDelivery(
    inArray(proposals.outboundWaMessageId, candidates),
    status,
    at,
  );
}
