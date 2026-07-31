"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ProposalRow = {
  id: string;
  leadId: string;
  status: string;
  demoUrl: string | null;
  demoStatus: string;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  repliedAt: string | null;
  createdAt: string;
  updatedAt: string;
  leadTitle: string;
  leadPhone: string | null;
  searchId: string;
  agentName: string | null;
};

type StatusFilter = "in_progress" | "sent" | "replied";

type ProposalsListPageProps = {
  status: StatusFilter;
  title: string;
  description: string;
  emptyMessage: string;
  dateLabel: string;
  dateField: "updatedAt" | "sentAt" | "repliedAt";
  showDashboardBack?: boolean;
  showChatAction?: boolean;
  proposalActionLabel?: string;
  linkToProposal?: boolean;
};

export function ProposalsListPage({
  status,
  title,
  description,
  emptyMessage,
  dateLabel,
  dateField,
  showDashboardBack = false,
  showChatAction = false,
  proposalActionLabel = "View lead",
  linkToProposal = false,
}: ProposalsListPageProps) {
  const [rows, setRows] = useState<ProposalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/proposals?status=${status}`, { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json()) as {
          proposals?: ProposalRow[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !data.proposals) {
          setError(data.error ?? "Failed to load proposals");
          return;
        }
        setRows(data.proposals);
      })
      .catch(() => {
        if (!cancelled) setError("Network error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6 sm:py-14">
      <header className="space-y-2">
        {showDashboardBack && (
          <Link
            href="/dashboard"
            className="inline-flex text-sm font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
          >
            ← Back to dashboard
          </Link>
        )}
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {title}
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">{description}</p>
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-zinc-500">{emptyMessage}</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="overflow-x-auto">
            <table
              aria-label={title}
              className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800"
            >
              <thead className="bg-zinc-50 dark:bg-zinc-950/50">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Business
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Phone
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    {dateLabel}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {rows.map((row) => {
                  const date = row[dateField];
                  return (
                    <tr
                      key={row.id}
                      className="hover:bg-zinc-50/80 dark:hover:bg-zinc-900/30"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-zinc-900 dark:text-zinc-50">
                          {row.leadTitle}
                        </p>
                        {row.agentName && (
                          <p className="text-xs text-zinc-500">
                            Agent: {row.agentName}
                          </p>
                        )}
                        {status === "sent" && (
                          <p className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                            {row.readAt
                              ? "Seen"
                              : row.deliveredAt
                                ? "Delivered"
                                : "Sent"}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                        {row.leadPhone ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                        {date ? new Date(date).toLocaleString() : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={{
                              pathname: `/searches/${encodeURIComponent(row.searchId)}`,
                              query: linkToProposal
                                ? {
                                    proposalLead: row.leadId,
                                    proposalAction: "view",
                                  }
                                : undefined,
                            }}
                            className="inline-flex rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-200 dark:hover:bg-emerald-950/40"
                            aria-label={`${proposalActionLabel} for ${row.leadTitle}`}
                          >
                            {proposalActionLabel}
                          </Link>
                          {showChatAction && (
                            <Link
                              href={{
                                pathname: "/agent/chat",
                                query: {
                                  lead: row.leadId,
                                  filter: "sent",
                                },
                              }}
                              className="inline-flex rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800"
                              aria-label={`View chat with ${row.leadTitle}`}
                            >
                              View chat
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}
