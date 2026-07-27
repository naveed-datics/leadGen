export type DemoStatus = "none" | "building" | "ready" | "failed";

export const DEMO_STATUS_NONE = "none" as const;
export const DEMO_STATUS_BUILDING = "building" as const;
export const DEMO_STATUS_READY = "ready" as const;
export const DEMO_STATUS_FAILED = "failed" as const;
