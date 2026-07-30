"use client";

import Link from "next/link";
import { useState } from "react";
import { ProposalSettingsModal } from "@/components/ProposalSettingsModal";
import type { SearchSummary } from "@/lib/types";

interface SearchesTableProps {
  searches: SearchSummary[];
  deletingSearchId?: string | null;
  onDeleteSearch: (search: SearchSummary) => void;
}

export function SearchesTable({
  searches,
  deletingSearchId = null,
  onDeleteSearch,
}: SearchesTableProps) {
  const [settingsSearch, setSettingsSearch] = useState<SearchSummary | null>(
    null,
  );

  if (searches.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-6 py-12 text-center dark:border-zinc-800 dark:bg-zinc-900/50">
        <p className="font-medium text-zinc-800 dark:text-zinc-200">
          No searches yet
        </p>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Run a search on the home page to build your lead history.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block text-sm font-medium text-emerald-600 hover:text-emerald-700"
        >
          Go to search
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="overflow-x-auto">
          <table aria-label="Saved searches" className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
            <thead className="bg-zinc-50 dark:bg-zinc-950/50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Query
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Date
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Leads
                </th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {searches.map((search) => (
                <tr
                  key={search.id}
                  className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">
                      {search.query}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {search.industry} · {search.location}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                    {formatDate(search.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                    {search.totalWithoutWebsite}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => onDeleteSearch(search)}
                        disabled={deletingSearchId === search.id}
                        aria-label={`Delete search ${search.query}`}
                        className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-60 dark:text-red-400 dark:hover:text-red-300"
                      >
                        {deletingSearchId === search.id ? "Deleting…" : "Delete"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSettingsSearch(search)}
                        aria-label={`Open settings for ${search.query}`}
                        className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                      >
                        Settings
                      </button>
                      <Link
                        href={`/searches/${search.id}`}
                        aria-label={`Explore search ${search.query}`}
                        className="text-sm font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                      >
                        Explore
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ProposalSettingsModal
        open={settingsSearch !== null}
        searchId={settingsSearch?.id ?? null}
        searchQuery={settingsSearch?.query}
        onClose={() => setSettingsSearch(null)}
      />
    </>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
