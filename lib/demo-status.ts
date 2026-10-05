export type DemoStatus = "none" | "building" | "template_ready" | "ready" | "failed";

export const DEMO_STATUS_NONE = "none" as const;
export const DEMO_STATUS_BUILDING = "building" as const;
/** Claude flow: site cloned and routine started, but not finished editing it. */
export const DEMO_STATUS_TEMPLATE_READY = "template_ready" as const;
export const DEMO_STATUS_READY = "ready" as const;
export const DEMO_STATUS_FAILED = "failed" as const;
