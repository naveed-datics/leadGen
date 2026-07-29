/** Trim, lowercase, and collapse internal whitespace for case-insensitive matching. */
export function normalizeLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeIndustryName(name: string): string {
  return normalizeLabel(name);
}

export function normalizeCityName(city: string): string {
  return normalizeLabel(city);
}

/**
 * Per-agent uniqueness key for a saved search.
 * Format: `{normalizedIndustry}|{normalizedCity}`
 */
export function buildSearchKey(industryName: string, city: string): string {
  return `${normalizeLabel(industryName)}|${normalizeLabel(city)}`;
}
