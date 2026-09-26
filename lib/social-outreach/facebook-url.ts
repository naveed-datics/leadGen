const FB_HOSTS = new Set(["facebook.com", "fb.com"]);

/** First path segments that are never a messageable business Page. */
const NON_PAGE_SEGMENTS = new Set([
  "groups",
  "sharer",
  "sharer.php",
  "share",
  "share.php",
  "login",
  "watch",
  "events",
  "marketplace",
  "hashtag",
  "permalink.php",
  "photo",
  "photo.php",
  "photos",
  "video",
  "videos",
  "reel",
  "story.php",
  "stories",
  "dialog",
  "plugins",
  "tr",
  "help",
  "policies",
  "privacy",
  "gaming",
  "public",
  "search",
  "l.php",
]);

function isFacebookHost(host: string): boolean {
  for (const known of FB_HOSTS) {
    if (host === known || host.endsWith(`.${known}`)) return true;
  }
  return false;
}

/**
 * Normalize a candidate to a canonical Facebook Page URL
 * (`https://www.facebook.com/<slug>` or `.../profile.php?id=<n>`), or null when
 * it is not a URL we can open and message (groups, posts, share links, ...).
 */
export function normalizeFacebookPageUrl(
  raw: string | null | undefined,
): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (!isFacebookHost(parsed.hostname.toLowerCase())) return null;

  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length === 0) return null;

  const first = segments[0].toLowerCase();
  if (first === "profile.php") {
    const id = parsed.searchParams.get("id");
    return id && /^\d+$/.test(id)
      ? `https://www.facebook.com/profile.php?id=${id}`
      : null;
  }
  if (first === "pages") {
    // Legacy form: /pages/<name>/<numeric id>
    const id = segments[2];
    if (!id || !/^\d+$/.test(id)) return null;
    return `https://www.facebook.com/pages/${segments[1]}/${id}`;
  }
  if (NON_PAGE_SEGMENTS.has(first)) return null;
  // Deep links (posts, photos, reviews...) belong to a Page: keep the slug only.
  return `https://www.facebook.com/${segments[0]}`;
}

/** First usable Facebook Page URL from an ordered list of candidates. */
export function pickFacebookPageUrl(
  candidates: Array<string | null | undefined>,
): string | null {
  for (const candidate of candidates) {
    const normalized = normalizeFacebookPageUrl(candidate);
    if (normalized) return normalized;
  }
  return null;
}

/** Split a comma-separated `leads.socials` string into candidates. */
export function splitSocialsCandidates(socials: string | null | undefined): string[] {
  if (!socials?.trim()) return [];
  return socials
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}
