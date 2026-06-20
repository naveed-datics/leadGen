export type WordPressPage = {
  id: number;
  title: string;
  link: string;
  status: string;
};

export type WordPressReplacements = {
  businessName: string;
  phone: string;
  industry: string;
  location: string;
};

type WpPageRaw = {
  id: number;
  link: string;
  status: string;
  title: { raw?: string; rendered?: string };
  content: { raw?: string; rendered?: string };
  slug?: string;
};

const REQUEST_TIMEOUT_MS = 15000;

export function normalizeWordPressBaseUrl(url: string): string {
  let normalized = url.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = `https://${normalized}`;
  }
  return normalized;
}

function authHeader(username: string, appPassword: string): string {
  const password = appPassword.replace(/\s/g, "");
  const token = Buffer.from(`${username}:${password}`).toString("base64");
  return `Basic ${token}`;
}

function applyReplacements(text: string, replacements: WordPressReplacements): string {
  return text
    .replace(/\{\{businessName\}\}/g, replacements.businessName)
    .replace(/\{\{phone\}\}/g, replacements.phone)
    .replace(/\{\{industry\}\}/g, replacements.industry)
    .replace(/\{\{location\}\}/g, replacements.location);
}

async function wpRequest<T>(
  baseUrl: string,
  username: string,
  appPassword: string,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${normalizeWordPressBaseUrl(baseUrl)}/wp-json/wp/v2${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: authHeader(username, appPassword),
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 401 || res.status === 403) {
        throw new Error("Invalid WordPress credentials");
      }
      if (res.status === 404) {
        throw new Error("WordPress REST API not found — check the site URL");
      }
      throw new Error(text.slice(0, 200) || `WordPress request failed (${res.status})`);
    }

    return (await res.json()) as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("WordPress request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function mapPage(page: WpPageRaw): WordPressPage {
  return {
    id: page.id,
    title: page.title?.raw ?? page.title?.rendered ?? "Untitled",
    link: page.link,
    status: page.status,
  };
}

export async function testWordPressConnection(
  baseUrl: string,
  username: string,
  appPassword: string,
): Promise<void> {
  await wpRequest<{ id: number }>(
    baseUrl,
    username,
    appPassword,
    "/users/me",
  );
}

export async function listWordPressPages(
  baseUrl: string,
  username: string,
  appPassword: string,
): Promise<WordPressPage[]> {
  const pages = await wpRequest<WpPageRaw[]>(
    baseUrl,
    username,
    appPassword,
    "/pages?per_page=100&status=publish,draft&orderby=title&order=asc",
  );
  return pages.map(mapPage);
}

export async function cloneWordPressPage({
  baseUrl,
  username,
  appPassword,
  sourcePageId,
  replacements,
  slug,
}: {
  baseUrl: string;
  username: string;
  appPassword: string;
  sourcePageId: number;
  replacements: WordPressReplacements;
  slug: string;
}): Promise<{ demoUrl: string; wpPageId: number }> {
  const source = await wpRequest<WpPageRaw>(
    baseUrl,
    username,
    appPassword,
    `/pages/${sourcePageId}?context=edit`,
  );

  const titleRaw = source.title?.raw ?? source.title?.rendered ?? "Demo";
  const contentRaw = source.content?.raw ?? source.content?.rendered ?? "";

  const title = applyReplacements(titleRaw, replacements);
  const content = applyReplacements(contentRaw, replacements);

  const created = await wpRequest<WpPageRaw>(
    baseUrl,
    username,
    appPassword,
    "/pages",
    {
      method: "POST",
      body: JSON.stringify({
        title,
        content,
        status: "draft",
        slug,
      }),
    },
  );

  return {
    demoUrl: created.link,
    wpPageId: created.id,
  };
}

export function isWordPressConfigured(
  baseUrl: string | null | undefined,
  username: string | null | undefined,
  appPasswordEnc: string | null | undefined,
): boolean {
  return Boolean(
    baseUrl?.trim() && username?.trim() && appPasswordEnc?.trim(),
  );
}
