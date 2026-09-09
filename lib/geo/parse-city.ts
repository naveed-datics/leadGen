/**
 * Best-effort city from a Google-style address.
 * e.g. "272 N 4th St, Laramie, WY 82072, USA" → "Laramie"
 */
export function parseCityFromAddress(address: string | null | undefined): string | null {
  if (!address?.trim()) return null;

  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) return null;

  // Skip trailing country (USA, United Kingdom, etc.)
  let end = parts.length - 1;
  const last = parts[end]?.toLowerCase() ?? "";
  if (
    last === "usa" ||
    last === "us" ||
    last === "united states" ||
    last === "united kingdom" ||
    last === "uk" ||
    last === "uae" ||
    last === "pakistan"
  ) {
    end -= 1;
  }

  if (end < 1) return null;

  // Segment before state/zip: "WY 82072" or "CA" or "England"
  const maybeStateZip = parts[end] ?? "";
  const looksLikeStateZip =
    /^[A-Z]{2}(\s+\d{4,5}(-\d{4})?)?$/i.test(maybeStateZip) ||
    /^[A-Z]{1,3}\s*\d/i.test(maybeStateZip);

  if (looksLikeStateZip && end >= 1) {
    const city = parts[end - 1]?.trim();
    return city || null;
  }

  // Fallback: second-to-last meaningful segment
  const fallback = parts[end - 1]?.trim() || parts[end]?.trim();
  return fallback || null;
}
