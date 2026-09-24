"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ActionIcon } from "@/components/ActionIcon";

type CampaignStatus = "draft" | "active" | "completed" | "archived";

type Campaign = {
  id: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  businessCount: number;
  createdAt: string;
  updatedAt: string;
};

type CampaignsResponse = { campaigns: Campaign[] } | { error: string };

type StatusFilter = "all" | CampaignStatus;

const STATUS_BADGE: Record<CampaignStatus, string> = {
  draft:
    "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  active:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  completed:
    "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
  archived:
    "bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-500",
};

const STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: "Draft",
  active: "Active",
  completed: "Completed",
  archived: "Archived",
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/campaigns", { cache: "no-store" });
      const data = (await res.json()) as CampaignsResponse;
      if (!res.ok || "error" in data) {
        setError("error" in data ? data.error : "Failed to load campaigns");
        setCampaigns([]);
        return;
      }
      setCampaigns(data.campaigns);
    } catch {
      setError("Network error");
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Failed to delete campaign");
        return;
      }
      setCampaigns((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      setError("Network error");
    } finally {
      setDeletingId(null);
    }
  }

  const visibleCampaigns =
    statusFilter === "all"
      ? campaigns.filter((c) => c.status !== "archived")
      : campaigns.filter((c) => c.status === statusFilter);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Campaigns
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Filtered collections of businesses for outreach.
          </p>
        </div>
        <Link
          href="/campaigns/new"
          className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          + Create Campaign
        </Link>
      </header>

      <div className="mt-6 flex items-center gap-2">
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Status
        </span>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        >
          <option value="all">All (excl. archived)</option>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {loading && <p className="mt-4 text-sm text-zinc-500">Loading campaigns…</p>}

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {!loading && !error && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full table-fixed text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/60">
              <tr>
                <th className="w-[35%] px-3 py-3 font-medium">Name</th>
                <th className="w-[15%] px-3 py-3 font-medium">Status</th>
                <th className="w-[15%] px-3 py-3 font-medium">Businesses</th>
                <th className="w-[20%] px-3 py-3 font-medium">Created</th>
                <th className="w-[15%] px-3 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleCampaigns.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-zinc-500">
                    No campaigns yet.
                  </td>
                </tr>
              ) : (
                visibleCampaigns.map((campaign) => (
                  <tr
                    key={campaign.id}
                    className="border-t border-zinc-100 dark:border-zinc-800"
                  >
                    <td className="px-3 py-3 align-top">
                      <Link
                        href={`/campaigns/${campaign.id}`}
                        className="font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-50"
                      >
                        {campaign.name}
                      </Link>
                      {campaign.description ? (
                        <div
                          className="mt-0.5 truncate text-xs text-zinc-500"
                          title={campaign.description}
                        >
                          {campaign.description}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[campaign.status]}`}
                      >
                        {STATUS_LABEL[campaign.status]}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-top text-zinc-700 dark:text-zinc-300">
                      {campaign.businessCount}
                    </td>
                    <td className="px-3 py-3 align-top text-zinc-500">
                      {new Date(campaign.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="flex items-center gap-1">
                        <Link
                          href={`/campaigns/${campaign.id}`}
                          title="View"
                          aria-label="View"
                          className="rounded-lg border border-sky-300 p-1.5 text-sky-700 hover:bg-sky-50 dark:border-sky-800 dark:text-sky-300 dark:hover:bg-sky-950/40"
                        >
                          <ActionIcon variant="view" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(campaign)}
                          disabled={campaign.status !== "draft" || deletingId === campaign.id}
                          title={
                            campaign.status === "draft"
                              ? "Delete"
                              : "Only draft campaigns can be deleted"
                          }
                          aria-label="Delete"
                          className="rounded-lg border border-red-200 p-1.5 text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40"
                        >
                          <ActionIcon variant="delete" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Delete campaign?
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              You are about to delete{" "}
              <span className="font-medium text-zinc-900 dark:text-zinc-200">
                {deleteTarget.name}
              </span>
              . Its businesses will become available for other campaigns. This
              action cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deletingId === deleteTarget.id}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={deletingId === deleteTarget.id}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                {deletingId === deleteTarget.id ? "Deleting…" : "Delete campaign"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
