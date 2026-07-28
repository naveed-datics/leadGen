"use client";

import Link from "next/link";
import { useState } from "react";

type TestOutcome = {
  kind: "success" | "error" | "warning";
  summary: string;
  details: unknown;
};

export default function InboundWebhookTestPage() {
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("Test inbound reply");
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<TestOutcome | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setOutcome(null);

    try {
      const res = await fetch("/api/agent/settings/inbound-webhook/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phone.trim(),
          message: message.trim(),
        }),
      });

      const data = (await res.json()) as {
        created?: boolean;
        hint?: string;
        error?: string;
      };

      if (!res.ok) {
        setOutcome({
          kind: "error",
          summary: data.error ?? "Test failed.",
          details: data,
        });
        return;
      }

      setOutcome({
        kind: data.created ? "success" : "warning",
        summary: data.hint ?? (data.created ? "Inbound lead created." : "No inbound lead created."),
        details: data,
      });
    } catch (err) {
      setOutcome({
        kind: "error",
        summary: err instanceof Error ? err.message : "Request failed.",
        details: null,
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
        Test inbound WhatsApp reply
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Simulates a customer reply locally — no ngrok or real WhatsApp message required.
        You must have sent an outbound WhatsApp to this number first (from a search lead).
      </p>

      <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4">
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Customer phone
          </label>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 555 123 4567"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            required
          />
        </div>
        <div>
          <label htmlFor="message" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Reply text
          </label>
          <textarea
            id="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <button
          type="submit"
          disabled={sending || !phone.trim()}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {sending ? "Simulating…" : "Simulate inbound reply"}
        </button>
      </form>

      {outcome && (
        <div
          role="status"
          className={`mt-6 rounded-xl border px-4 py-3 text-sm ${
            outcome.kind === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100"
              : outcome.kind === "warning"
                ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"
                : "border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
          }`}
        >
          <p className="font-medium">{outcome.summary}</p>
          {outcome.details ? (
            <pre className="mt-3 overflow-x-auto rounded-lg bg-black/5 p-3 text-xs dark:bg-black/20">
              {JSON.stringify(outcome.details, null, 2)}
            </pre>
          ) : null}
          {outcome.kind === "success" && (
            <Link
              href="/leads"
              className="mt-3 inline-block text-sm font-medium text-emerald-800 underline dark:text-emerald-200"
            >
              Open Leads page →
            </Link>
          )}
        </div>
      )}

      <section className="mt-10 rounded-xl border border-zinc-200 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">Real WhatsApp testing</h2>
        <ol className="mt-2 list-decimal space-y-2 pl-5">
          <li>
            On Vercel, LeadGen auto-registers the webhook when you open Settings → WhatsApp.
            Local dev still needs ngrok or{" "}
            <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">WAHA_WEBHOOK_BASE_URL</code>.
          </li>
          <li>Use ngrok locally: <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">ngrok http 3000</code></li>
          <li>Send a proposal via WhatsApp from a search lead, then reply from that phone.</li>
          <li>Check <Link href="/leads" className="underline">Leads</Link> and <Link href="/agent/chat" className="underline">Chat</Link>.</li>
        </ol>
      </section>
    </main>
  );
}
