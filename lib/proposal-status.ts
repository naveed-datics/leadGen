export type ProposalStatus = "in_progress" | "sent" | "replied" | "draft";

/** Saved proposal not yet sent on WhatsApp (includes legacy `draft`). */
export function isProposalInProgress(status: string): boolean {
  return status === "in_progress" || status === "draft";
}

export function isProposalSent(status: string): boolean {
  return status === "sent";
}

export function isProposalReplied(status: string): boolean {
  return status === "replied";
}

export const PROPOSAL_STATUS_IN_PROGRESS = "in_progress" as const;
export const PROPOSAL_STATUS_SENT = "sent" as const;
export const PROPOSAL_STATUS_REPLIED = "replied" as const;

/** Delivery/seen label for a sent proposal (null when not applicable). */
export function getProposalWhatsAppDeliveryLabel(proposal: {
  status: string;
  deliveredAt?: string | null;
  readAt?: string | null;
}): "Seen" | "Delivered" | "Sent" | null {
  if (!isProposalSent(proposal.status)) return null;
  if (proposal.readAt) return "Seen";
  if (proposal.deliveredAt) return "Delivered";
  return "Sent";
}
