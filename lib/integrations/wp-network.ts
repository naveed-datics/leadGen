import { normalizeWordPressBaseUrl } from "@/lib/integrations/wordpress";

/**
 * Talks to the leadGen WP plugin (`leadgen/v1`) directly so a demo site can be
 * cloned without going through demoGen. Auth is the agent's existing WP
 * application password; the plugin accepts any `manage_network` user.
 */

const REQUEST_TIMEOUT_MS = 30_000;
const PROVISION_TIMEOUT_MS = 280_000;
const MAX_SLUG_ATTEMPTS = 5;

export class WpNetworkError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "WpNetworkError";
  }
}

export type WpNetworkCredentials = {
  baseUrl: string;
  username: string;
  appPassword: string;
  /** leadGen plugin key; when set it is sent instead of Basic auth (as demoGen does). */
  pluginApiKey?: string | null;
};

export type WpTemplateSite = {
  id: number;
  title: string;
  slug: string;
  url: string;
};

export type WpSite = {
  id: number;
  slug: string;
  url: string;
  status?: string;
  error?: string | null;
};

export type CloneLead = {
  businessName: string;
  phone?: string | null;
  address?: string | null;
  category?: string | null;
};

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

const FILLER_WORDS = new Set(["service", "services", "company", "co", "and", "the"]);

function keywords(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !FILLER_WORDS.has(w));
}

/** e.g. "Cleaning Services" -> template "House Cleaning" (shared keyword). */
function looseMatch(
  templates: WpTemplateSite[],
  wanted: string,
): WpTemplateSite | null {
  const wantedWords = keywords(wanted);
  if (wantedWords.length === 0) return null;
  const hits = templates.filter((t) => {
    const words = new Set([...keywords(t.title), ...keywords(t.slug)]);
    return wantedWords.some((w) => words.has(w));
  });
  return hits.length === 1 ? hits[0] : null;
}

/** Match a requested template by numeric id, then slug, then title. */
export function matchTemplate(
  templates: WpTemplateSite[],
  requested: string | null | undefined,
): WpTemplateSite | null {
  const wanted = requested?.trim().toLowerCase();
  if (!wanted) return null;
  return (
    templates.find((t) => String(t.id) === wanted) ??
    templates.find((t) => t.slug.toLowerCase() === wanted) ??
    templates.find((t) => t.title.toLowerCase() === wanted) ??
    looseMatch(templates, wanted)
  );
}

export function slugCandidates(base: string): string[] {
  const root = slugify(base) || "demo";
  return Array.from({ length: MAX_SLUG_ATTEMPTS }, (_, i) =>
    i === 0 ? root : `${root}-${i + 1}`,
  );
}

async function wpRequest<T>(
  creds: WpNetworkCredentials,
  path: string,
  init: { method?: string; body?: unknown; timeoutMs?: number } = {},
): Promise<T> {
  const url = `${normalizeWordPressBaseUrl(creds.baseUrl)}/wp-json/leadgen/v1${path}`;
  const token = Buffer.from(
    `${creds.username}:${creds.appPassword.replace(/\s/g, "")}`,
  ).toString("base64");
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    init.timeoutMs ?? REQUEST_TIMEOUT_MS,
  );

  try {
    const res = await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        ...(creds.pluginApiKey
          ? { "X-LeadGen-API-Key": creds.pluginApiKey }
          : { Authorization: `Basic ${token}` }),
        "Content-Type": "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
      cache: "no-store",
    });
    const data = (await res.json().catch(() => null)) as
      | (T & { message?: string })
      | null;

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new WpNetworkError(
          "WordPress rejected the credentials. The WP user must be a network super-admin to clone sites.",
          res.status,
        );
      }
      throw new WpNetworkError(
        `${data?.message || `WordPress request failed (${res.status})`} [${init.method ?? "GET"} ${path}]`,
        res.status,
      );
    }
    return data as T;
  } catch (error) {
    if (error instanceof WpNetworkError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new WpNetworkError("WordPress request timed out", 504);
    }
    throw new WpNetworkError(
      error instanceof Error ? error.message : "WordPress request failed",
      502,
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function wpListTemplates(creds: WpNetworkCredentials) {
  // The plugin answers `{ sites: [...] }` (same shape demoGen reads).
  return wpRequest<{ sites?: WpTemplateSite[] } | WpTemplateSite[]>(
    creds,
    "/templates",
  ).then((r) => (Array.isArray(r) ? r : (r.sites ?? [])));
}

export function wpGetSite(creds: WpNetworkCredentials, id: number) {
  return wpRequest<WpSite>(creds, `/sites/${id}`);
}

export function wpDeleteSite(creds: WpNetworkCredentials, id: number) {
  return wpRequest<{ deleted?: boolean }>(creds, `/sites/${id}`, {
    method: "DELETE",
  });
}

/**
 * Clone a template subsite for a lead and return the ready site (`url` is the
 * demo URL). Retries with `-2`, `-3`… when the slug is already taken.
 */
export async function cloneTemplateSite(
  creds: WpNetworkCredentials,
  lead: CloneLead,
  template: string | null | undefined,
): Promise<WpSite> {
  const templates = await wpListTemplates(creds);
  const matched = matchTemplate(templates, template);
  if (template?.trim() && !matched) {
    throw new WpNetworkError(
      `Template "${template}" was not found on the WordPress network. Pick one in the campaign Settings.`,
      400,
    );
  }

  let created: WpSite | null = null;
  let lastError: unknown;
  for (const slug of slugCandidates(lead.businessName)) {
    try {
      created = await wpRequest<WpSite>(creds, "/sites", {
        method: "POST",
        body: {
          slug,
          title: `${lead.businessName} Demo`,
          template_blog_id: matched?.id,
          page_map: [],
          lead: {
            business_name: lead.businessName,
            phone: lead.phone ?? "",
            address: lead.address ?? "",
            category: lead.category ?? "",
          },
        },
      });
      break;
    } catch (error) {
      lastError = error;
      if (!(error instanceof WpNetworkError && error.status === 409)) throw error;
    }
  }
  if (!created) {
    throw lastError instanceof Error
      ? lastError
      : new WpNetworkError("Could not find a free site slug", 409);
  }

  try {
    await wpRequest(creds, `/sites/${created.id}/provision/sync`, {
      method: "POST",
      timeoutMs: PROVISION_TIMEOUT_MS,
    });

    const site = await wpGetSite(creds, created.id);
    if (site.status && site.status !== "ready") {
      throw new WpNetworkError(
        site.error || `Site clone finished with status "${site.status}"`,
        502,
      );
    }
    return { ...created, ...site };
  } catch (error) {
    // Never leave a half-built clone behind.
    await wpDeleteSite(creds, created.id).catch(() => {
      // Best-effort — surface the original clone error.
    });
    throw error;
  }
}
