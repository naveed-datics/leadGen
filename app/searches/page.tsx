"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchesTable } from "@/components/SearchesTable";
import {
  SearchForm,
  type IndustryOption,
} from "@/components/SearchForm";
import { SearchProgress } from "@/components/SearchProgress";
import type { SearchSummary } from "@/lib/types";

type MeResponse =
  | {
      user: {
        role: "admin" | "agent";
      };
    }
  | { error: string };

type AgentSettingsResponse =
  | {
      agent: {
        region: string | null;
        serpApiKeyConfigured: boolean;
        searchEnabled: boolean;
      };
    }
  | { error: string };

type CitiesResponse = { cities: string[] } | { error: string };

type IndustriesResponse =
  | { industries: IndustryOption[] }
  | { error: string };

export default function SearchesPage() {
  const router = useRouter();

  const [searches, setSearches] = useState<SearchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingSearchId, setDeletingSearchId] = useState<string | null>(null);
  const [searchToDelete, setSearchToDelete] = useState<SearchSummary | null>(null);

  const [showNewSearch, setShowNewSearch] = useState(false);
  const [meRole, setMeRole] = useState<"admin" | "agent" | null>(null);
  const [country, setCountry] = useState<string>("");
  const [cities, setCities] = useState<string[]>([]);
  const [industries, setIndustries] = useState<IndustryOption[]>([]);
  const [serpApiReady, setSerpApiReady] = useState<boolean>(true);
  const [agentSearchEnabled, setAgentSearchEnabled] = useState<boolean>(true);

  const [industryId, setIndustryId] = useState("");
  const [city, setCity] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicateSearchId, setDuplicateSearchId] = useState<string | null>(null);

  const loadSearches = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/searches");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to load searches");
        return;
      }
      setSearches(data.searches);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSearches();
  }, [loadSearches]);

  useEffect(() => {
    let cancelled = false;
    async function loadMe() {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const data = (await res.json()) as MeResponse;
        if (cancelled) return;
        if (!res.ok || "error" in data) {
          setMeRole(null);
          return;
        }
        setMeRole(data.user.role);
      } catch {
        if (!cancelled) setMeRole(null);
      }
    }
    void loadMe();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadAgentSettings() {
      if (meRole !== "agent") return;
      const res = await fetch("/api/agent/settings", { cache: "no-store" });
      const data = (await res.json()) as AgentSettingsResponse;
      if (!res.ok || !("agent" in data)) return;
      const assignedCountry = (data.agent.region ?? "").trim();
      if (!assignedCountry) return;
      if (!cancelled) setCountry(assignedCountry);
      if (!cancelled) {
        setSerpApiReady(Boolean(data.agent.serpApiKeyConfigured));
        setAgentSearchEnabled(Boolean(data.agent.searchEnabled));
      }

      const citiesRes = await fetch(
        `/api/geo/cities?country=${encodeURIComponent(assignedCountry)}`,
        { cache: "no-store" },
      );
      const citiesData = (await citiesRes.json()) as CitiesResponse;
      if (!citiesRes.ok) return;
      const list =
        "cities" in citiesData && Array.isArray(citiesData.cities)
          ? citiesData.cities
          : [];
      if (!cancelled) {
        setCities(list);
        setCity((prev) => (!prev && list.length > 0 ? list[0] : prev));
      }
    }
    void loadAgentSettings();
    return () => {
      cancelled = true;
    };
  }, [meRole]);

  useEffect(() => {
    let cancelled = false;
    async function loadIndustries() {
      if (meRole !== "agent") return;
      try {
        const res = await fetch("/api/agent/industries", { cache: "no-store" });
        const data = (await res.json()) as IndustriesResponse;
        if (cancelled || !res.ok || !("industries" in data)) return;
        const list = Array.isArray(data.industries) ? data.industries : [];
        setIndustries(list);
        if (list.length > 0) {
          setIndustryId((current) =>
            current && list.some((i) => i.id === current) ? current : list[0].id,
          );
        } else {
          setIndustryId("");
        }
      } catch {
        // ignore
      }
    }
    void loadIndustries();
    return () => {
      cancelled = true;
    };
  }, [meRole]);

  const handleDeleteSearch = useCallback((search: SearchSummary) => {
    setSearchToDelete(search);
  }, []);

  const confirmDeleteSearch = useCallback(async () => {
    if (!searchToDelete) return;

    setDeletingSearchId(searchToDelete.id);
    setError(null);
    try {
      const res = await fetch(`/api/searches/${searchToDelete.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Failed to delete search");
        return;
      }
      setSearches((prev) => prev.filter((s) => s.id !== searchToDelete.id));
      setSearchToDelete(null);
    } catch {
      setError("Network error");
    } finally {
      setDeletingSearchId(null);
    }
  }, [searchToDelete]);

  function clearDuplicateState() {
    setDuplicateSearchId(null);
    setFormError(null);
  }

  function closeNewSearch() {
    if (submitting) return;
    setShowNewSearch(false);
    setFormError(null);
    setDuplicateSearchId(null);
  }

  async function handleNewSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (meRole !== "agent") {
      setFormError("Lead search is available to agents only.");
      return;
    }
    if (!serpApiReady || !agentSearchEnabled) {
      return;
    }
    if (!industryId) {
      setFormError("Select an industry before searching.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    setDuplicateSearchId(null);

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ industryId, city }),
      });

      const data = await response.json();

      if (!response.ok) {
        const existingId =
          typeof data?.existingSearchId === "string"
            ? data.existingSearchId.trim()
            : "";
        if (response.status === 409 && existingId) {
          setDuplicateSearchId(existingId);
        }
        setFormError(data.error ?? "Search failed");
        setSubmitting(false);
        return;
      }

      const searchId =
        typeof data?.searchId === "string" ? data.searchId.trim() : "";
      if (!searchId) {
        setFormError("Search completed, but the saved search ID was not returned.");
        setSubmitting(false);
        return;
      }

      // Hide the popup once results are in, then open the new search.
      setShowNewSearch(false);
      setSubmitting(false);
      await loadSearches();
      router.push(`/searches/${encodeURIComponent(searchId)}`);
    } catch {
      setFormError("Network error. Check your connection and try again.");
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6 sm:py-14">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Saved Searches
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Past queries and businesses without a website to pitch.
          </p>
        </div>
        {meRole === "agent" && (
          <button
            type="button"
            onClick={() => setShowNewSearch(true)}
            className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            + Add new search
          </button>
        )}
      </header>

      {loading && (
        <p className="text-sm text-zinc-500">Loading searches…</p>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {!loading && !error && (
        <SearchesTable
          searches={searches}
          deletingSearchId={deletingSearchId}
          onDeleteSearch={handleDeleteSearch}
        />
      )}

      {searchToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Delete Search?
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              You are about to delete{" "}
              <span className="font-medium text-zinc-900 dark:text-zinc-200">
                {searchToDelete.query}
              </span>
              . This removes all related leads, proposals, and search items. This action cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSearchToDelete(null)}
                disabled={deletingSearchId === searchToDelete.id}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDeleteSearch()}
                disabled={deletingSearchId === searchToDelete.id}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                {deletingSearchId === searchToDelete.id ? "Deleting…" : "Delete search"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showNewSearch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  Add new search
                </h2>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Select an industry and city to search Google Maps for businesses without a website.
                </p>
              </div>
              <button
                type="button"
                onClick={closeNewSearch}
                disabled={submitting}
                className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 disabled:opacity-60 dark:text-zinc-400 dark:hover:bg-zinc-800"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {meRole === "agent" && !agentSearchEnabled && (
                <div
                  role="status"
                  className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"
                >
                  Search is disabled by admin.
                </div>
              )}

              {meRole === "agent" && agentSearchEnabled && !serpApiReady && (
                <div
                  role="status"
                  className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"
                >
                  Add your SerpApi key in Settings to enable search.
                </div>
              )}

              <SearchForm
                industryId={industryId}
                industryOptions={industries}
                industryLockedToOptions
                location={city}
                locationLabel={`Region: ${country || "—"}`}
                locationOptions={cities}
                locationPlaceholder="Search city"
                locationLockedToOptions
                disabled={!serpApiReady || !agentSearchEnabled}
                loading={submitting}
                onIndustryChange={(id) => {
                  clearDuplicateState();
                  setIndustryId(id);
                }}
                onLocationChange={(value) => {
                  clearDuplicateState();
                  setCity(value);
                }}
                onSubmit={handleNewSearchSubmit}
              />

              <SearchProgress active={submitting} />

              {formError && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
                >
                  {formError}
                  {duplicateSearchId && (
                    <>
                      {" "}
                      <button
                        type="button"
                        onClick={() => {
                          setShowNewSearch(false);
                          router.push(
                            `/searches/${encodeURIComponent(duplicateSearchId)}`,
                          );
                        }}
                        className="font-medium underline hover:no-underline"
                      >
                        Open existing search
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
