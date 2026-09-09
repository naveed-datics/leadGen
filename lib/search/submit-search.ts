import { PER_CITY_TARGET } from "@/lib/search/constants";
import type {
  BulkCityCreated,
  BulkCityFailed,
  BulkCitySkipped,
  BulkSearchResponse,
} from "@/lib/types";

export type AggregatedBulkSearch = {
  country: string;
  industry: string;
  perCityTarget: number;
  totalCities: number;
  created: BulkCityCreated[];
  skipped: BulkCitySkipped[];
  failed: BulkCityFailed[];
};

export type SubmitSearchSuccess =
  | { ok: true; kind: "single"; searchId: string }
  | { ok: true; kind: "bulk"; result: AggregatedBulkSearch };

export type SubmitSearchFailure = {
  ok: false;
  status: number;
  error: string;
  existingSearchId?: string;
};

export type SubmitSearchResult = SubmitSearchSuccess | SubmitSearchFailure;

function isBulkSearchResponse(data: unknown): data is BulkSearchResponse {
  return (
    typeof data === "object" &&
    data !== null &&
    "mode" in data &&
    (data as { mode: unknown }).mode === "bulk"
  );
}

function mergeBulkChunk(
  totals: AggregatedBulkSearch,
  chunk: BulkSearchResponse,
): AggregatedBulkSearch {
  return {
    country: chunk.country,
    industry: chunk.industry,
    perCityTarget: chunk.perCityTarget,
    totalCities: chunk.totalCities,
    created: [...totals.created, ...chunk.created],
    skipped: [...totals.skipped, ...chunk.skipped],
    failed: [...totals.failed, ...chunk.failed],
  };
}

export async function submitAgentSearch(params: {
  industryId: string;
  city?: string;
  onBulkChunk?: (totals: AggregatedBulkSearch) => void;
}): Promise<SubmitSearchResult> {
  const city = params.city?.trim() ?? "";

  if (city) {
    const response = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ industryId: params.industryId, city }),
    });
    const data = (await response.json()) as {
      error?: string;
      existingSearchId?: string;
      searchId?: string;
    };

    if (!response.ok) {
      const existingId =
        typeof data.existingSearchId === "string" ? data.existingSearchId.trim() : "";
      return {
        ok: false,
        status: response.status,
        error: data.error ?? "Search failed",
        existingSearchId: existingId || undefined,
      };
    }

    const searchId = typeof data.searchId === "string" ? data.searchId.trim() : "";
    if (!searchId) {
      return {
        ok: false,
        status: 502,
        error: "Search completed, but the saved search ID was not returned.",
      };
    }

    return { ok: true, kind: "single", searchId };
  }

  let resumeAfter: string | undefined;
  let totals: AggregatedBulkSearch = {
    country: "",
    industry: "",
    perCityTarget: PER_CITY_TARGET,
    totalCities: 0,
    created: [],
    skipped: [],
    failed: [],
  };

  for (;;) {
    const response = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        industryId: params.industryId,
        ...(resumeAfter ? { resumeAfter } : {}),
      }),
    });
    const data: unknown = await response.json();

    if (!response.ok) {
      const payload = data as { error?: string; existingSearchId?: string };
      const existingId =
        typeof payload.existingSearchId === "string"
          ? payload.existingSearchId.trim()
          : "";
      return {
        ok: false,
        status: response.status,
        error: payload.error ?? "Search failed",
        existingSearchId: existingId || undefined,
      };
    }

    if (!isBulkSearchResponse(data)) {
      return {
        ok: false,
        status: 502,
        error: "Unexpected search response. Try again.",
      };
    }

    totals = mergeBulkChunk(totals, data);
    params.onBulkChunk?.(totals);

    if (data.complete) {
      return { ok: true, kind: "bulk", result: totals };
    }

    if (!data.resumeAfter) {
      return {
        ok: false,
        status: 502,
        error: "Bulk search paused without a resume point. Open Saved Searches and try again.",
      };
    }

    resumeAfter = data.resumeAfter;
  }
}
