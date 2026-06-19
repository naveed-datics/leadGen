"use client";

import { useCallback, useEffect, useState } from "react";
import { SearchesTable } from "@/components/SearchesTable";
import type { SearchSummary } from "@/lib/types";

export default function SearchesPage() {
  const [searches, setSearches] = useState<SearchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6 sm:py-14">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Opportunities
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Past queries and businesses without a website to pitch.
        </p>
      </header>

      {loading && (
        <p className="text-sm text-zinc-500">Loading searches…</p>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {!loading && !error && <SearchesTable searches={searches} />}
    </main>
  );
}
