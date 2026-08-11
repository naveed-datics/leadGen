"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type Demo = {
  leadId: string;
  title: string;
  mapsUrl: string | null;
  searchId: string;
  proposalId: string;
  proposalStatus: string;
  hasProposal: boolean;
  demoUrl: string | null;
  demoRequestedAt: string | null;
  demoGenLeadId: string | null;
  updatedAt: string;
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export default function DemosPage() {
  const [demos, setDemos] = useState<Demo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingLeadId, setDeletingLeadId] = useState<string | null>(null);
  const [demoToDelete, setDemoToDelete] = useState<Demo | null>(null);
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/demos", { cache: "no-store" });
      const data = (await res.json()) as { demos?: Demo[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load demos");
      setDemos(data.demos ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load demos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (demoToDelete) cancelDeleteRef.current?.focus();
  }, [demoToDelete]);

  const confirmDeleteDemo = useCallback(async () => {
    if (!demoToDelete) return;

    setDeletingLeadId(demoToDelete.leadId);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${demoToDelete.leadId}/demo`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? "Failed to delete demo");
        return;
      }
      setDemos((prev) => prev.filter((demo) => demo.leadId !== demoToDelete.leadId));
      setDemoToDelete(null);
    } catch {
      setError("Network error");
    } finally {
      setDeletingLeadId(null);
    }
  }, [demoToDelete]);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Demos
      </h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Completed demo sites across all your leads.
      </p>

      {loading ? (
        <p role="status" className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          Loading…
        </p>
      ) : error ? (
        <div
          role="alert"
          className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
        </div>
      ) : demos.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          No completed demos yet.
        </p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table aria-label="Completed demos" className="w-full text-left text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">
                  Lead
                </th>
                <th scope="col" className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">
                  Created
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium text-zinc-600 dark:text-zinc-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {demos.map((demo) => (
                <tr
                  key={demo.leadId}
                  className="border-t border-zinc-200 dark:border-zinc-800"
                >
                  <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">
                    {demo.title}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {formatDate(demo.demoRequestedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      {demo.demoUrl && (
                        <a
                          href={demo.demoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-200 dark:hover:bg-emerald-950/40"
                          title="Open demo site"
                          aria-label={`View demo for ${demo.title} (opens in new tab)`}
                        >
                          View demo
                        </a>
                      )}
                      {demo.demoGenLeadId && (
                        <Link
                          href={`/demos/${demo.leadId}/edit`}
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-900 dark:bg-zinc-200 dark:text-zinc-900 dark:hover:bg-white"
                          aria-label={`Edit demo for ${demo.title}`}
                        >
                          Edit demo
                        </Link>
                      )}
                      <Link
                        href={{
                          pathname: `/searches/${encodeURIComponent(demo.searchId)}`,
                          query: {
                            proposalLead: demo.leadId,
                            proposalAction: demo.hasProposal ? "view" : "create",
                          },
                        }}
                        className={`inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium ${
                          demo.hasProposal
                            ? "bg-emerald-700 text-white hover:bg-emerald-800"
                            : "bg-zinc-800 text-white hover:bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                        }`}
                        aria-label={`${demo.hasProposal ? "View" : "Create"} proposal for ${demo.title}`}
                      >
                        {demo.hasProposal ? "View proposal" : "Create proposal"}
                      </Link>
                      <button
                        type="button"
                        onClick={() => setDemoToDelete(demo)}
                        disabled={deletingLeadId === demo.leadId}
                        className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-60 dark:text-red-400 dark:hover:text-red-300"
                        aria-label={
                          deletingLeadId === demo.leadId
                            ? `Deleting demo for ${demo.title}`
                            : `Delete demo for ${demo.title}`
                        }
                      >
                        {deletingLeadId === demo.leadId ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {demoToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-demo-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <h2
              id="delete-demo-title"
              className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
            >
              Permanently delete this demo?
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              This deletes the demo for{" "}
              <span className="font-medium text-zinc-900 dark:text-zinc-200">
                {demoToDelete.title}
              </span>{" "}
              everywhere: the demo record and its <strong>live WordPress site</strong> are both
              removed. This cannot be undone. The lead and proposal in LeadGen stay, and you can
              create a new demo later.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                ref={cancelDeleteRef}
                type="button"
                onClick={() => setDemoToDelete(null)}
                disabled={deletingLeadId === demoToDelete.leadId}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDeleteDemo()}
                disabled={deletingLeadId === demoToDelete.leadId}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                {deletingLeadId === demoToDelete.leadId ? "Deleting…" : "Delete demo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
