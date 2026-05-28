"use client";

import Link from "next/link";
import { useState } from "react";
import { BusinessList } from "@/components/BusinessList";
import { SearchForm } from "@/components/SearchForm";
import { SearchProgress } from "@/components/SearchProgress";
import type { SearchResult } from "@/lib/types";

export default function Home() {
  const [industry, setIndustry] = useState("");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [searched, setSearched] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setSearched(false);

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ industry, location }),
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

      <SearchForm
        industry={industry}
        location={location}
        loading={loading}
        onIndustryChange={setIndustry}
        onLocationChange={setLocation}
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
