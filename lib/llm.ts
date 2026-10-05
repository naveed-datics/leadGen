import type { WebsiteStats } from "@/lib/types";

export interface LLMProvider {
  apiKey: string;
  baseUrl: string;
  /** Tried in order until one succeeds. */
  models: string[];
}

export interface LLMConfig extends LLMProvider {
  fallback: LLMProvider | null;
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

const DEFAULT_LLM_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai";
const DEFAULT_LLM_MODELS = "gemini-3.5-flash-lite,gemini-3.5-flash";
const DEFAULT_FALLBACK_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_FALLBACK_MODELS =
  "google/gemma-4-31b-it:free,nvidia/nemotron-3-super-120b-a12b:free,google/gemma-4-26b-a4b-it:free";

function parseModels(value: string): string[] {
  return value
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
}

export function getLLMConfig(): LLMConfig | null {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) return null;

  const fallbackKey = process.env.LLM_FALLBACK_API_KEY;

  return {
    apiKey,
    baseUrl: process.env.LLM_BASE_URL || DEFAULT_LLM_BASE_URL,
    models: parseModels(process.env.LLM_MODEL || DEFAULT_LLM_MODELS),
    fallback: fallbackKey
      ? {
          apiKey: fallbackKey,
          baseUrl:
            process.env.LLM_FALLBACK_BASE_URL || DEFAULT_FALLBACK_BASE_URL,
          models: parseModels(
            process.env.LLM_FALLBACK_MODEL || DEFAULT_FALLBACK_MODELS,
          ),
        }
      : null,
  };
}

async function requestCompletion(
  provider: LLMProvider,
  model: string,
  system: string,
  user: string,
): Promise<string> {
  const url = `${provider.baseUrl.replace(/\/$/, "")}/chat/completions`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model,
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
    throw new Error(`LLM error ${response.status} (${model}): ${text}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error(`LLM returned empty response (${model})`);
  }
  return content;
}

async function chatCompletion(
  config: LLMConfig,
  system: string,
  user: string,
): Promise<string> {
  const attempts = [config, config.fallback].flatMap((provider) =>
    provider ? provider.models.map((model) => ({ provider, model })) : [],
  );

  const errors: string[] = [];
  for (const { provider, model } of attempts) {
    try {
      return await requestCompletion(provider, model, system, user);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[llm] ${model} failed, trying next: ${message}`);
      errors.push(message);
    }
  }
  throw new Error(`All LLM models failed:\n${errors.join("\n")}`);
}

function parseJson<T>(raw: string): T {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse JSON from AI response");
  }
  return JSON.parse(jsonMatch[0]) as T;
}

// Over-pick so the proposal still has 3 after zero-traffic sites are dropped.
export const MAX_COMPETITOR_PICKS = 3;

export async function pickNearestCompetitors(
  target: CompetitorTarget,
  candidates: CompetitorCandidate[],
  config?: LLMConfig | null,
): Promise<string[]> {
  const cfg = config ?? getLLMConfig();
  if (!cfg) {
    throw new Error("LLM is not configured");
  }

  if (candidates.length === 0) return [];

  const system = `You rank local business competitors by geographic proximity.
Return ONLY valid JSON: { "competitorIds": string[] }
Pick up to 5 competitor IDs from the candidates list, ordered nearest first.
Rules:
- Only use IDs from the candidates list; never invent businesses
- Prefer same city/area as the target and search location
- Use addresses and coordinates for proximity
- Candidates must have a website (already filtered)
- Exclude the target business if it appears in candidates
- If fewer than 5 valid candidates exist, return fewer IDs`;

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
  return ids.slice(0, MAX_COMPETITOR_PICKS);
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
  config?: LLMConfig | null,
): Promise<WebsiteStats> {
  const cfg = config ?? getLLMConfig();
  if (!cfg) {
    throw new Error("LLM is not configured");
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
