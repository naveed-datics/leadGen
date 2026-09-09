"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  SearchForm,
  type IndustryOption,
} from "@/components/SearchForm";
import { SearchProgress } from "@/components/SearchProgress";
import type { LocationChoice } from "@/lib/geo/cities";
import {
  submitAgentSearch,
  type AggregatedBulkSearch,
} from "@/lib/search/submit-search";

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
        googlePlacesApiKeyConfigured: boolean;
        searchDataSource: "serpapi" | "google_places";
        searchEnabled: boolean;
      };
    }
  | { error: string };

type CitiesResponse =
  | { cities: string[]; locations?: LocationChoice[] }
  | { error: string };

type IndustriesResponse =
  | { industries: IndustryOption[] }
  | { error: string };

export default function Home() {
  const router = useRouter();
  const [industryId, setIndustryId] = useState("");
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateSearchId, setDuplicateSearchId] = useState<string | null>(null);

  const [meRole, setMeRole] = useState<"admin" | "agent" | null>(null);
  const [country, setCountry] = useState<string>("");
  const [cities, setCities] = useState<string[]>([]);
  const [locationChoices, setLocationChoices] = useState<LocationChoice[]>([]);
  const [industries, setIndustries] = useState<IndustryOption[]>([]);
  const [searchProviderReady, setSearchProviderReady] = useState<boolean>(true);
  const [searchProviderLabel, setSearchProviderLabel] = useState("SerpApi");
  const [agentSearchEnabled, setAgentSearchEnabled] = useState<boolean>(true);
  const [bulkActive, setBulkActive] = useState(false);
  const [bulkProcessed, setBulkProcessed] = useState(0);
  const [bulkTotal, setBulkTotal] = useState(0);
  const [bulkSummary, setBulkSummary] = useState<AggregatedBulkSearch | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadMe() {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const data = (await res.json()) as MeResponse;
        if (cancelled) return;
        if (!res.ok) {
          setMeRole(null);
          return;
        }
        setMeRole("user" in data ? data.user.role : null);
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
      if (!res.ok) return;
      if (!("agent" in data)) return;
      const assignedCountry = (data.agent.region ?? "").trim();
      if (!assignedCountry) return;
      if (!cancelled) setCountry(assignedCountry);
      if (!cancelled) {
        const source =
          data.agent.searchDataSource === "google_places"
            ? "google_places"
            : "serpapi";
        const ready =
          source === "google_places"
            ? Boolean(data.agent.googlePlacesApiKeyConfigured)
            : Boolean(data.agent.serpApiKeyConfigured);
        setSearchProviderReady(ready);
        setSearchProviderLabel(
          source === "google_places" ? "Google Places" : "SerpApi",
        );
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
      const locations =
        "locations" in citiesData && Array.isArray(citiesData.locations)
          ? citiesData.locations
          : [];
      if (!cancelled) {
        setCities(list);
        setLocationChoices(locations);
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

  function clearDuplicateState() {
    setDuplicateSearchId(null);
    setError(null);
    setBulkSummary(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (meRole !== "agent") {
      setError("Lead search is available to agents only.");
      return;
    }
    if (!searchProviderReady || !agentSearchEnabled) {
      return;
    }
    if (!industryId) {
      setError("Select an industry before searching.");
      return;
    }
    const isBulk = !city.trim();
    setLoading(true);
    setError(null);
    setDuplicateSearchId(null);
    setBulkSummary(null);
    setBulkActive(isBulk);
    setBulkProcessed(0);
    setBulkTotal(0);

    try {
      const result = await submitAgentSearch({
        industryId,
        city,
        onBulkChunk: (totals) => {
          setBulkTotal(totals.totalCities);
          setBulkProcessed(
            totals.created.length + totals.skipped.length + totals.failed.length,
          );
        },
      });

      if (!result.ok) {
        if (result.status === 409 && result.existingSearchId) {
          setDuplicateSearchId(result.existingSearchId);
        }
        setError(result.error);
        setLoading(false);
        setBulkActive(false);
        return;
      }

      if (result.kind === "bulk") {
        setBulkSummary(result.result);
        setLoading(false);
        setBulkActive(false);
        return;
      }

      // Keep loading=true through navigation so the form stays disabled and
      // cannot be double-submitted while the route transition is in flight.
      router.push(`/searches/${encodeURIComponent(result.searchId)}`);
    } catch {
      setError("Network error. Check your connection and try again.");
      setLoading(false);
      setBulkActive(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
      <header className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
          LeadGen
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl dark:text-zinc-50">
          Find local businesses without a website
        </h1>
        <p className="max-w-2xl text-zinc-600 dark:text-zinc-400">
          Select country and industry. Leave state or city empty to search every city
          (300 results each), or pick a location to run a single search.
        </p>
      </header>

      {meRole === "admin" && (
        <div
          role="status"
          className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-300"
        >
          Lead search is available to agents only. Manage agents from{" "}
          <Link href="/admin/agents" className="font-medium underline">
            Agents
          </Link>
          , or open{" "}
          <Link href="/searches" className="font-medium underline">
            Saved Searches
          </Link>{" "}
          to review existing results.
        </div>
      )}

      {meRole === "agent" && !agentSearchEnabled && (
        <div
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"
        >
          Search is disabled by admin.
        </div>
      )}

      {meRole === "agent" && agentSearchEnabled && !searchProviderReady && (
        <div
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"
        >
          Add your {searchProviderLabel} key in{" "}
          <Link href="/agent/settings" className="font-medium underline">
            Settings
          </Link>{" "}
          to enable search.
        </div>
      )}

      {meRole === "agent" && (
        <>
          <SearchForm
            country={country}
            industryId={industryId}
            industryOptions={industries}
            industryLockedToOptions
            location={city}
            locationLabel="State or city"
            locationOptions={cities}
            locationChoices={locationChoices}
            locationPlaceholder="Optional — leave empty to search all cities"
            locationLockedToOptions
            disabled={!searchProviderReady || !agentSearchEnabled}
            loading={loading}
            onIndustryChange={(id) => {
              clearDuplicateState();
              setIndustryId(id);
            }}
            onLocationChange={(value) => {
              clearDuplicateState();
              setCity(value);
            }}
            onSubmit={handleSubmit}
          />

          <SearchProgress
            active={loading}
            mode={bulkActive ? "bulk" : "single"}
            processedCities={bulkProcessed}
            totalCities={bulkTotal}
          />
        </>
      )}

      {bulkSummary && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100"
        >
          Country-wide search finished for {bulkSummary.industry} in{" "}
          {bulkSummary.country}: {bulkSummary.created.length} new searches,{" "}
          {bulkSummary.skipped.length} already saved
          {bulkSummary.failed.length > 0
            ? `, ${bulkSummary.failed.length} failed`
            : ""}
          .{" "}
          <Link href="/searches" className="font-medium underline hover:no-underline">
            Open saved searches
          </Link>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
          {duplicateSearchId && (
            <>
              {" "}
              <Link
                href={`/searches/${encodeURIComponent(duplicateSearchId)}`}
                className="font-medium underline hover:no-underline"
              >
                Open existing search
              </Link>
            </>
          )}
        </div>
      )}
    </main>
  );
}
