"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type DemoStatus = "none" | "building" | "ready" | "failed";

type Demo = {
  leadId: string;
  title: string;
  mapsUrl: string | null;
  searchId: string;
  proposalId: string;
  proposalStatus: string;
  demoUrl: string | null;
  demoStatus: DemoStatus;
  demoRequestedAt: string | null;
  updatedAt: string;
};

const POLL_INTERVAL_MS = 10_000;

const STATUS_BADGE: Record<DemoStatus, string> = {
  none: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  building:
    "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  ready:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200",
};

const STATUS_LABEL: Record<DemoStatus, string> = {
  none: "None",
  building: "Building",
  ready: "Ready",
  failed: "Failed",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export default function DemosPage() {
  const [demos, setDemos] = useState<Demo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    const hasBuilding = demos.some((d) => d.demoStatus === "building");

    if (hasBuilding && !intervalRef.current) {
      intervalRef.current = setInterval(() => {
        void load();
      }, POLL_INTERVAL_MS);
    }

    if (!hasBuilding && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [demos, load]);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Demos
      </h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Tracks demo site builds across all your leads — building, ready, or
        failed. Updates automatically while any demo is still building.
      </p>

      {loading ? (
        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
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
          No demos requested yet.
        </p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">
                  Lead
                </th>
                <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">
                  Status
                </th>
                <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">
                  Requested
                </th>
                <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">
                  Demo
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
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${STATUS_BADGE[demo.demoStatus]}`}
                    >
                      {STATUS_LABEL[demo.demoStatus]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {formatDate(demo.demoRequestedAt)}
                  </td>
                  <td className="px-4 py-3">
                    {demo.demoStatus === "ready" && demo.demoUrl ? (
                      <a
                        href={demo.demoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-200 dark:hover:bg-emerald-950/40"
                        title="Open demo site"
                      >
                        View demo
                      </a>
                    ) : (
                      <span className="text-xs text-zinc-400 dark:text-zinc-600">
                        —
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
