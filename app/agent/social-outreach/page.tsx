"use client";

import { useCallback, useEffect, useState } from "react";

type Job = {
  id: string;
  businessName: string;
  targetUrl: string;
  body: string;
  status: string;
  reason: string | null;
  sentAt: string | null;
};

const STATUS_STYLES: Record<string, string> = {
  queued: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  approved: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  sending: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  sent: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  skipped: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  cancelled: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
};

export default function SocialOutreachPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/social/outreach", { cache: "no-store" });
      const data = (await res.json()) as { jobs?: Job[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load queue");
      setJobs(data.jobs ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(interval);
  }, [load]);

  async function act(path: "approve" | "cancel") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/social/outreach/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  const queued = jobs.filter((j) => j.status === "queued").length;
  const pending = jobs.filter((j) => j.status === "queued" || j.status === "approved").length;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-3xl font-bold tracking-[-0.035em] text-zinc-900 dark:text-zinc-50">
        Facebook outreach queue
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        Review the messages, approve the batch, then press Start in the Chrome
        extension. It sends slowly, up to your daily cap, from your own Facebook login.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || queued === 0}
          onClick={() => act("approve")}
          className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-50"
        >
          Approve {queued} queued
        </button>
        <button
          type="button"
          disabled={busy || pending === 0}
          onClick={() => act("cancel")}
          className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Cancel {pending} pending
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">Loading…</p>
      ) : jobs.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          The queue is empty. Select businesses and choose &ldquo;Message on Facebook&rdquo;.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {jobs.map((job) => (
            <li
              key={job.id}
              className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{job.businessName}</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[job.status] ?? ""}`}
                >
                  {job.status}
                  {job.reason ? `: ${job.reason}` : ""}
                </span>
              </div>
              <a
                href={job.targetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 block truncate text-xs text-emerald-700 hover:underline dark:text-emerald-400"
              >
                {job.targetUrl}
              </a>
              <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
                {job.body}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
