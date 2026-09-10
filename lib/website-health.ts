/**
 * Website health check + homepage copyright scrape.
 *
 * Single GET per site: classify reachability from the status / thrown error,
 * and pull the footer copyright line out of the HTML with plain regex (no DOM
 * dependency — keeps the Vercel serverless function light).
 */

const REQUEST_TIMEOUT_MS = 8000;
const MAX_BODY_BYTES = 1_500_000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; LeadGenBot/1.0; +https://leadgen.app/bot)";

/** ok = reachable, down = dead/5xx/DNS/TLS, blocked = bot-wall, error = inconclusive. */
export type WebsiteCheckState = "ok" | "down" | "blocked" | "error";

export interface WebsiteHealthResult {
  httpStatus: number | null;
  state: WebsiteCheckState;
  copyrightText: string | null;
  copyrightYear: number | null;
}

export function normalizeWebsiteUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function classifyStatus(status: number): WebsiteCheckState {
  if (status >= 200 && status < 400) return "ok";
  if (status === 401 || status === 403 || status === 429) return "blocked";
  return "down";
}

const COPYRIGHT_MARKER =
  /(?:©|&copy;|&#0*169;|&#x0*a9;|\bcopyright\b|\ball rights reserved\b)/i;

function decodeEntities(value: string): string {
  return value
    .replace(/&copy;/gi, "©")
    .replace(/&#0*169;/g, "©")
    .replace(/&#x0*a9;/gi, "©")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*8211;|&ndash;/gi, "–")
    .replace(/&#0*8212;|&mdash;/gi, "—");
}

/** Pull the shortest readable text run that contains a copyright marker. */
export function extractCopyright(html: string): {
  copyrightText: string | null;
  copyrightYear: number | null;
} {
  if (!html) return { copyrightText: null, copyrightYear: null };

  // Drop scripts/styles so their contents can't masquerade as footer text.
  const cleaned = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");

  // Split into text runs on tag boundaries, then scan for the marker.
  const runs = cleaned
    .split(/<[^>]+>/)
    .map((run) => decodeEntities(run).replace(/\s+/g, " ").trim())
    .filter(Boolean);

  let match: string | null = null;
  for (const run of runs) {
    if (!COPYRIGHT_MARKER.test(run)) continue;
    if (run.length > 200) {
      // Marker sits inside a long blob — narrow to the sentence around it.
      const idx = run.search(COPYRIGHT_MARKER);
      const start = Math.max(0, idx - 80);
      match = run.slice(start, idx + 120).trim();
    } else {
      match = run;
    }
    break;
  }

  if (!match) return { copyrightText: null, copyrightYear: null };

  const text = match.slice(0, 200);
  const years = text.match(/(?:19|20)\d{2}/g);
  const copyrightYear = years
    ? Math.max(...years.map((year) => Number.parseInt(year, 10)))
    : null;

  return { copyrightText: text, copyrightYear };
}

async function readCappedText(response: Response): Promise<string> {
  const body = response.body;
  if (!body) return response.text();

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    text += decoder.decode(value, { stream: true });
    if (received >= MAX_BODY_BYTES) {
      await reader.cancel();
      break;
    }
  }
  return text;
}

export async function checkWebsite(url: string): Promise<WebsiteHealthResult> {
  const target = normalizeWebsiteUrl(url);
  if (!target) {
    return {
      httpStatus: null,
      state: "error",
      copyrightText: null,
      copyrightYear: null,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(target, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
    });

    const state = classifyStatus(response.status);

    let copyrightText: string | null = null;
    let copyrightYear: number | null = null;
    if (state === "ok") {
      try {
        const html = await readCappedText(response);
        ({ copyrightText, copyrightYear } = extractCopyright(html));
      } catch {
        // Body read failed after a good status — keep the status, skip scrape.
      }
    } else {
      await response.body?.cancel().catch(() => {});
    }

    return { httpStatus: response.status, state, copyrightText, copyrightYear };
  } catch {
    // DNS failure, connection refused, TLS error, or timeout abort.
    return {
      httpStatus: null,
      state: "down",
      copyrightText: null,
      copyrightYear: null,
    };
  } finally {
    clearTimeout(timeout);
  }
}
