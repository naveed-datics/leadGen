"use client";

import { useEffect, useState } from "react";
import { WhatsAppConnectionCard } from "@/components/WhatsAppConnectionCard";
import { DemoWebhookCard } from "@/components/DemoWebhookCard";

type AgentSettings = {
  id: string;
  name: string;
  email: string;
  region: string | null;
  active: boolean;
  searchEnabled: boolean;
  whatsAppEnabled: boolean;
  serpApiKeyConfigured: boolean;
  waConfigured: boolean;
};

export default function AgentSettingsPage() {
  const [agent, setAgent] = useState<AgentSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [serpApiKey, setSerpApiKey] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agent/settings", { cache: "no-store" });
      const data = (await res.json()) as { agent?: AgentSettings; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load settings");
      setAgent(data.agent ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/agent/settings/integrations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serpApiKey: serpApiKey.trim() ? serpApiKey : undefined,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save settings");
      setSuccess("Saved.");
      setSerpApiKey("");
      await load();
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Failed to save settings");
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-3xl font-bold tracking-[-0.035em] text-zinc-900 dark:text-zinc-50">
        Settings
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        Configure your integrations. Secrets are stored encrypted and are not shown
        again after saving.
      </p>

      {loading ? (
        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">Loading…</p>
      ) : agent ? (
        <div className="mt-7 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <span className="block text-xs font-medium text-zinc-500">Region</span>
              <span className="mt-1 block font-semibold">{agent.region ?? "Not assigned"}</span>
            </div>
            <div>
              <span className="block text-xs font-medium text-zinc-500">Search</span>
              <span className="mt-1 block font-semibold">
                {agent.searchEnabled ? "Enabled" : "Disabled by admin"}
              </span>
            </div>
            <div>
              <span className="block text-xs font-medium text-zinc-500">WhatsApp</span>
              <span className="mt-1 block font-semibold">
                {agent.whatsAppEnabled ? "Enabled" : "Disabled by admin"}
              </span>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-zinc-100 pt-4 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
            <span>SerpApi key: {agent.serpApiKeyConfigured ? "Configured" : "Missing"}</span>
            <span>WAHA: {agent.waConfigured ? "Configured server-side" : "Not configured"}</span>
          </div>
        </div>
      ) : (
        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          No settings found.
        </p>
      )}

      {error && (
        <div
          role="alert"
          className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
        </div>
      )}

      {success && (
        <div
          role="status"
          className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100"
        >
          {success}
        </div>
      )}

      <WhatsAppConnectionCard />

      <DemoWebhookCard />

      <form onSubmit={save} className="mt-6 space-y-6">
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-base font-semibold">SerpApi</h2>
          <label className="mt-3 block">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              API key
            </span>
            <input
              value={serpApiKey}
              onChange={(e) => setSerpApiKey(e.target.value)}
              className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-3 text-sm text-zinc-950 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
              placeholder={agent?.serpApiKeyConfigured ? "•••••••• (set a new key)" : "paste key"}
            />
          </label>
        </section>

        <button
          type="submit"
          className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 active:scale-[0.98]"
        >
          Save settings
        </button>
      </form>
    </main>
  );
}

