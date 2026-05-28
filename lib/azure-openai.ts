import type { WebsiteStats } from "@/lib/types";

export interface AzureOpenAIConfig {
  apiKey: string;
  endpoint: string;
  deployment: string;
  apiVersion: string;
}

export interface CompetitorCandidate {
  id: string;
  title: string;
  address: string | null;
  website: string;
  latitude: number | null;
  longitude: number | null;
  type: string | null;
  rating: number | null;
}

export interface CompetitorTarget {
  title: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  type: string | null;
  searchLocation: string;
  searchIndustry: string;
}

export function getAzureOpenAIConfig(): AzureOpenAIConfig | null {
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION;

  if (!apiKey || !endpoint || !deployment || !apiVersion) {
    return null;
  }

  return { apiKey, endpoint, deployment, apiVersion };
}

async function chatCompletion(
  config: AzureOpenAIConfig,
  system: string,
  user: string,
): Promise<string> {
  const base = config.endpoint.replace(/\/$/, "");
  const url = `${base}/openai/deployments/${config.deployment}/chat/completions?api-version=${encodeURIComponent(config.apiVersion)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": config.apiKey,
    },
    body: JSON.stringify({
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Azure OpenAI error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Azure OpenAI returned empty response");
  }
  return content;
}

function parseJson<T>(raw: string): T {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse JSON from AI response");
  }
  return JSON.parse(jsonMatch[0]) as T;
}

export async function pickNearestCompetitors(
  target: CompetitorTarget,
  candidates: CompetitorCandidate[],
  config?: AzureOpenAIConfig | null,
): Promise<string[]> {
  const cfg = config ?? getAzureOpenAIConfig();
  if (!cfg) {
    throw new Error("Azure OpenAI is not configured");
  }

  if (candidates.length === 0) return [];

  const system = `You rank local business competitors by geographic proximity.
Return ONLY valid JSON: { "competitorIds": string[] }
Pick up to 3 competitor IDs from the candidates list, ordered nearest first.
Rules:
- Only use IDs from the candidates list; never invent businesses
- Prefer same city/area as the target and search location
- Use addresses and coordinates for proximity
- Candidates must have a website (already filtered)
- Exclude the target business if it appears in candidates
- If fewer than 3 valid candidates exist, return fewer IDs`;

  const user = JSON.stringify({
    target,
    candidates: candidates.map((c) => ({
      id: c.id,
      title: c.title,
      address: c.address,
      website: c.website,
      latitude: c.latitude,
      longitude: c.longitude,
      type: c.type,
      rating: c.rating,
    })),
  });

  const raw = await chatCompletion(cfg, system, user);
  const parsed = parseJson<{ competitorIds?: string[] }>(raw);
  const validIds = new Set(candidates.map((c) => c.id));
  const ids = (parsed.competitorIds ?? []).filter((id) => validIds.has(id));
  return ids.slice(0, 3);
}

export interface WebsiteStatsHints {
  domainAge?: string | null;
  lastUpdated?: string | null;
  pageTitle?: string | null;
  reachable?: boolean;
}

export async function estimateWebsiteStats(
  url: string,
  hints: WebsiteStatsHints,
  config?: AzureOpenAIConfig | null,
): Promise<WebsiteStats> {
  const cfg = config ?? getAzureOpenAIConfig();
  if (!cfg) {
    throw new Error("Azure OpenAI is not configured");
  }

  const system = `You estimate website analytics when measured data is incomplete.
Return ONLY valid JSON:
{
  "trafficLabel": string | null,
  "trafficEstimate": string | null,
  "websiteAge": string | null,
  "lastUpdated": string | null
}
Use conservative ranges (e.g. "Low", "~2k visits/mo"). Do not claim exact precision.
Prefer hints when provided; fill only missing fields.`;

  const user = JSON.stringify({ url, hints });

  const raw = await chatCompletion(cfg, system, user);
  const parsed = parseJson<{
    trafficLabel?: string | null;
    trafficEstimate?: string | null;
    websiteAge?: string | null;
    lastUpdated?: string | null;
  }>(raw);

  return {
    trafficLabel: parsed.trafficLabel ?? null,
    trafficEstimate: parsed.trafficEstimate ?? null,
    websiteAge: parsed.websiteAge ?? null,
    lastUpdated: parsed.lastUpdated ?? null,
    source: "ai",
  };
}
