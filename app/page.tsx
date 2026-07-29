"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  SearchForm,
  type IndustryOption,
} from "@/components/SearchForm";
import { SearchProgress } from "@/components/SearchProgress";

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
  const [industries, setIndustries] = useState<IndustryOption[]>([]);
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

  function clearDuplicateState() {
    setDuplicateSearchId(null);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (meRole !== "agent") {
      setError("Lead search is available to agents only.");
      return;
    }
    if (!serpApiReady || !agentSearchEnabled) {
      return;
    }
    if (!industryId) {
      setError("Select an industry before searching.");
      return;
    }
    setLoading(true);
    setError(null);
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
        setError(data.error ?? "Search failed");
        setLoading(false);
        return;
      }

      const searchId =
        typeof data?.searchId === "string" ? data.searchId.trim() : "";
      if (!searchId) {
        setError("Search completed, but the saved search ID was not returned.");
        setLoading(false);
        return;
      }

      // Keep loading=true through navigation so the form stays disabled and
      // cannot be double-submitted while the route transition is in flight.
      router.push(`/searches/${encodeURIComponent(searchId)}`);
    } catch {
      setError("Network error. Check your connection and try again.");
      setLoading(false);
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
          Select an industry and city to search Google Maps via SerpApi and
          list leads that have no website listed.
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

      {meRole === "agent" && (
        <>
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

          <SearchProgress active={loading} />
        </>
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
