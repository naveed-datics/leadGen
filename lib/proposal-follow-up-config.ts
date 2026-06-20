export const FOLLOW_UP_DAY3_MS = 3 * 24 * 60 * 60 * 1000;
export const FOLLOW_UP_DAY7_MS = 7 * 24 * 60 * 60 * 1000;

export function isProposalFollowUpsEnabled(): boolean {
  return process.env.PROPOSAL_FOLLOW_UPS_ENABLED !== "false";
}
