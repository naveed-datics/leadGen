export type ProposalStatus = "in_progress" | "sent" | "draft";

/** Saved proposal not yet sent on WhatsApp (includes legacy `draft`). */
export function isProposalInProgress(status: string): boolean {
  return status === "in_progress" || status === "draft";
}

export function isProposalSent(status: string): boolean {
  return status === "sent";
}

export const PROPOSAL_STATUS_IN_PROGRESS = "in_progress" as const;
export const PROPOSAL_STATUS_SENT = "sent" as const;
