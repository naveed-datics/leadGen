import type { industries } from "@/lib/db/schema";

type IndustryRow = typeof industries.$inferSelect;

export function serializeIndustry(row: Pick<
  IndustryRow,
  "id" | "name" | "nameNormalized" | "createdAt" | "updatedAt"
>) {
  return {
    id: row.id,
    name: row.name,
    nameNormalized: row.nameNormalized,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  const message =
    "message" in error && typeof error.message === "string" ? error.message : "";
  return (
    code === "23505" ||
    message.includes("duplicate key") ||
    message.includes("unique")
  );
}
