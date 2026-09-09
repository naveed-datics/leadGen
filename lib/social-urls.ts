const IG_FB_HOSTS = new Set(["instagram.com", "facebook.com", "fb.com"]);

const ALL_SOCIAL_HOSTS = new Set([
  "facebook.com",
  "fb.com",
  "instagram.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "youtube.com",
  "youtu.be",
  "pinterest.com",
  "snapchat.com",
  "telegram.me",
  "t.me",
  "whatsapp.com",
  "wa.me",
]);

function hostnameOf(url: string): string | null {
  try {
    const withProtocol = /^https?:\/\//i.test(url.trim())
      ? url.trim()
      : `https://${url.trim()}`;
    const { hostname } = new URL(withProtocol);
    return hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** True when the URL is any known social host (used by proposal competitor filters). */
export function isSocialWebsiteUrl(url: string): boolean {
  const host = hostnameOf(url);
  return host != null && ALL_SOCIAL_HOSTS.has(host);
}

/** True when the URL is Instagram or Facebook (Find Socials move target). */
export function isInstagramOrFacebookUrl(url: string): boolean {
  const host = hostnameOf(url);
  return host != null && IG_FB_HOSTS.has(host);
}

/** Normalize to https://host/path without trailing slash (except root). */
export function normalizeSocialUrl(url: string): string {
  const trimmed = url.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    parsed.hash = "";
    let href = parsed.toString();
    if (href.endsWith("/") && parsed.pathname !== "/") {
      href = href.slice(0, -1);
    }
    return href;
  } catch {
    return trimmed;
  }
}

function splitSocials(existing: string | null | undefined): string[] {
  if (!existing?.trim()) return [];
  return existing
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Merge URLs into a comma-separated list; de-dupe (case-insensitive), preserve order. */
export function mergeSocials(
  existing: string | null | undefined,
  urls: string[],
): string {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of [...splitSocials(existing), ...urls]) {
    const normalized = normalizeSocialUrl(raw);
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }

  return out.join(",");
}
