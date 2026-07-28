"use client";

import { useCallback, useEffect, useState } from "react";
import { SearchesTable } from "@/components/SearchesTable";
import type { SearchSummary } from "@/lib/types";

export default function SearchesPage() {
  const [searches, setSearches] = useState<SearchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingSearchId, setDeletingSearchId] = useState<string | null>(null);
  const [searchToDelete, setSearchToDelete] = useState<SearchSummary | null>(null);

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
    </main>
  );
}
