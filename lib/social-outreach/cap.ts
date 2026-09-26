export const DEFAULT_DAILY_CAP = 10;
/** Server-side ceiling regardless of what an agent configures. */
export const HARD_MAX_DAILY_CAP = 30;
export const CAP_WINDOW_MS = 24 * 60 * 60 * 1000;

export function effectiveDailyCap(configured: number | null | undefined): number {
  const value = Number.isFinite(configured) ? Math.floor(configured as number) : DEFAULT_DAILY_CAP;
  return Math.min(Math.max(value, 0), HARD_MAX_DAILY_CAP);
}

export function remainingToday(
  configuredCap: number | null | undefined,
  sentInWindow: number,
): number {
  return Math.max(effectiveDailyCap(configuredCap) - sentInWindow, 0);
}

/** Rolling-window start (avoids timezone ambiguity of a calendar day). */
export function capWindowStart(now: Date = new Date()): Date {
  return new Date(now.getTime() - CAP_WINDOW_MS);
}
