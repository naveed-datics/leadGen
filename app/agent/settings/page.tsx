"use client";

import { useEffect, useState } from "react";

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
  const [waAccessToken, setWaAccessToken] = useState("");
  const [waPhoneNumberId, setWaPhoneNumberId] = useState("");
  const [waBusinessAccountId, setWaBusinessAccountId] = useState("");
  const [waAppId, setWaAppId] = useState("");

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
          waAccessToken: waAccessToken.trim() ? waAccessToken : undefined,
          waPhoneNumberId: waPhoneNumberId.trim() ? waPhoneNumberId : undefined,
          waBusinessAccountId: waBusinessAccountId.trim()
            ? waBusinessAccountId
            : undefined,
          waAppId: waAppId.trim() ? waAppId : undefined,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save settings");
      setSuccess("Saved.");
      setSerpApiKey("");
      setWaAccessToken("");
      await load();
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Failed to save settings");
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Settings
      </h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Configure your integrations. Secrets are stored encrypted and are not shown
        again after saving.
      </p>

      {loading ? (
        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">Loading…</p>
      ) : agent ? (
        <div className="mt-6 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="text-sm">
            <div>
              <span className="text-zinc-500">Region:</span>{" "}
              <span className="font-medium">{agent.region ?? "—"}</span>
            </div>
            <div className="mt-1">
              <span className="text-zinc-500">Search:</span>{" "}
              {agent.searchEnabled ? "Enabled" : "Disabled by admin"}
            </div>
            <div className="mt-1">
              <span className="text-zinc-500">WhatsApp:</span>{" "}
              {agent.whatsAppEnabled ? "Enabled" : "Disabled by admin"}
            </div>
          </div>
          <div className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
            SerpApi key: {agent.serpApiKeyConfigured ? "Configured" : "Missing"} ·
            WhatsApp creds: {agent.waConfigured ? "Configured" : "Missing"}
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
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100">
          {success}
        </div>
      )}

      <form onSubmit={save} className="mt-6 space-y-6">
        <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="text-sm font-semibold">SerpApi</h2>
          <label className="mt-3 block">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              API key
            </span>
            <input
              value={serpApiKey}
              onChange={(e) => setSerpApiKey(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              placeholder={agent?.serpApiKeyConfigured ? "•••••••• (set a new key)" : "paste key"}
            />
          </label>
        </section>

        <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="text-sm font-semibold">WhatsApp Cloud API (Meta)</h2>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            You need at least an access token and phone number id.
          </p>

          <label className="mt-3 block">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Access token
            </span>
            <input
              value={waAccessToken}
              onChange={(e) => setWaAccessToken(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              placeholder={agent?.waConfigured ? "•••••••• (set a new token)" : "paste token"}
            />
          </label>

          <label className="mt-3 block">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Phone number id
            </span>
            <input
              value={waPhoneNumberId}
              onChange={(e) => setWaPhoneNumberId(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              placeholder="e.g. 1234567890"
            />
          </label>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Business account id (optional)
              </span>
              <input
                value={waBusinessAccountId}
                onChange={(e) => setWaBusinessAccountId(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                App id (optional)
              </span>
              <input
                value={waAppId}
                onChange={(e) => setWaAppId(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              />
            </label>
          </div>
        </section>

        <button
          type="submit"
          className="rounded-md bg-black px-4 py-2 text-sm text-white"
        >
          Save settings
        </button>
      </form>
    </main>
  );
}

