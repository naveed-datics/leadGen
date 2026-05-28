"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BusinessList } from "@/components/BusinessList";
import { SearchForm } from "@/components/SearchForm";
import { SearchProgress } from "@/components/SearchProgress";
import type { SearchResult } from "@/lib/types";

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

export default function Home() {
  const [industry, setIndustry] = useState("");
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [searched, setSearched] = useState(false);

  const [meRole, setMeRole] = useState<"admin" | "agent" | null>(null);
  const [country, setCountry] = useState<string>("");
  const [cities, setCities] = useState<string[]>([]);
  const [serpApiReady, setSerpApiReady] = useState<boolean>(true);
  const [agentSearchEnabled, setAgentSearchEnabled] = useState<boolean>(true);

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
        setSerpApiReady(Boolean(data.agent.serpApiKeyConfigured));
        setAgentSearchEnabled(Boolean(data.agent.searchEnabled));
      }

      const citiesRes = await fetch(
        `/api/geo/cities?country=${encodeURIComponent(assignedCountry)}`,
        { cache: "no-store" },
      );
      const citiesData = (await citiesRes.json()) as CitiesResponse;
      if (!citiesRes.ok) return;
      const list = "cities" in citiesData && Array.isArray(citiesData.cities) ? citiesData.cities : [];
      if (!cancelled) {
        setCities(list);
        if (!city && list.length > 0) setCity(list[0]);
      }
    }
    void loadAgentSettings();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meRole]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (meRole === "agent" && (!serpApiReady || !agentSearchEnabled)) {
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    setSearched(false);

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ industry, city }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Search failed");
        return;
      }

      setResult(data as SearchResult);
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
      setSearched(true);
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
          Enter an industry and location to search Google Maps via SerpApi and
          list leads that have no website listed.
        </p>
      </header>

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
          Add your SerpApi key in{" "}
          <Link href="/agent/settings" className="font-medium underline">
            Settings
          </Link>{" "}
          to enable search.
        </div>
      )}

      <SearchForm
        industry={industry}
        location={city}
        locationLabel={meRole === "agent" ? `Region: ${country || "—"}` : "Location"}
        locationOptions={meRole === "agent" ? cities : undefined}
        locationPlaceholder={meRole === "agent" ? "Search city" : "e.g. Austin, TX"}
        locationLockedToOptions={meRole === "agent"}
        disabled={meRole === "agent" ? !serpApiReady || !agentSearchEnabled : false}
        loading={loading}
        onIndustryChange={setIndustry}
        onLocationChange={setCity}
        onSubmit={handleSubmit}
      />

      <SearchProgress active={loading} />

      {result?.searchId && searched && !loading && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100">
          Saved to history.{" "}
          <Link
            href={`/searches/${result.searchId}`}
            className="font-medium underline hover:no-underline"
          >
            View leads & proposals
          </Link>
        </p>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
        </div>
      )}

      <BusinessList result={result} searched={searched && !loading} />
    </main>
  );
}
