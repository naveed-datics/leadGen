"use client";

import { useState } from "react";
import Link from "next/link";

type TestOutcome = {
  kind: "success" | "error";
  summary: string;
  status: number | null;
  raw: unknown;
};

export default function DemoWebhookTestPage() {
  const [leadId, setLeadId] = useState("");
  const [demoUrl, setDemoUrl] = useState("");
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<TestOutcome | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setOutcome(null);

    try {
      const res = await fetch("/api/agent/settings/demo-webhook/test-callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: leadId.trim(), demoUrl: demoUrl.trim() }),
      });

      const data = (await res.json()) as {
        status?: number;
        response?: { ok?: boolean; error?: string };
        error?: string;
      };

      if (!res.ok) {
        setOutcome({
          kind: "error",
          summary: data.error ?? "Failed to reach the test endpoint.",
          status: data.status ?? res.status,
          raw: data,
        });
        return;
      }

      const webhookStatus = data.status ?? null;
      const webhookOk = webhookStatus === 200 && data.response?.ok === true;

      setOutcome({
        kind: webhookOk ? "success" : "error",
        summary: webhookOk
          ? "Webhook accepted the request and saved the demo URL."
          : data.response?.error ?? `Webhook responded with status ${webhookStatus}.`,
        status: webhookStatus,
        raw: data.response,
      });
    } catch (err) {
      setOutcome({
        kind: "error",
        summary: err instanceof Error ? err.message : "Request failed.",
        status: null,
        raw: null,
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <Link
        href="/agent/settings"
        className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
      >
        ← Back to settings
      </Link>

      <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Test demo webhook
      </h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Simulates a third-party call to <code>/api/webhooks/demo-url</code> using
        the server-side secret, so you can verify a lead ID + demo URL save
        correctly without sharing the real secret with anyone else.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-6 space-y-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
      >
        <label className="block">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Lead ID
          </span>
          <input
            value={leadId}
            onChange={(e) => setLeadId(e.target.value)}
            required
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            placeholder="00000000-0000-0000-0000-000000000000"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Demo URL
          </span>
          <input
            value={demoUrl}
            onChange={(e) => setDemoUrl(e.target.value)}
            required
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            placeholder="https://example.com/demo-site"
          />
        </label>

        <button
          type="submit"
          disabled={sending}
          className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
        >
          {sending ? "Sending…" : "Send test webhook"}
        </button>
      </form>

      {outcome && (
        <div
          role={outcome.kind === "error" ? "alert" : "status"}
          className={
            outcome.kind === "success"
              ? "mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100"
              : "mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
          }
        >
          <p className="font-medium">
            {outcome.kind === "success" ? "Success" : "Error"}
            {outcome.status !== null ? ` (HTTP ${outcome.status})` : ""}
          </p>
          <p className="mt-1">{outcome.summary}</p>
          {outcome.raw !== null && outcome.raw !== undefined && (
            <pre className="mt-3 overflow-x-auto rounded-md bg-black/5 p-2 text-xs dark:bg-white/5">
              {JSON.stringify(outcome.raw, null, 2)}
            </pre>
          )}
        </div>
      )}
    </main>
  );
}
