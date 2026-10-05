"use client";

import { useCallback, useEffect, useState } from "react";

type WpSettings = {
  wpConfigured: boolean;
  wpBaseUrl: string | null;
  wpUsername: string | null;
  wpPluginApiKeyConfigured: boolean;
};

export function WordPressConnectionCard() {
  const [settings, setSettings] = useState<WpSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [baseUrl, setBaseUrl] = useState("");
  const [username, setUsername] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [pluginApiKey, setPluginApiKey] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agent/settings/demo", { cache: "no-store" });
      const data = (await res.json()) as WpSettings & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load WordPress settings");
      setSettings(data);
      setBaseUrl(data.wpBaseUrl ?? "");
      setUsername(data.wpUsername ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load WordPress settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/agent/settings/demo", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wpBaseUrl: baseUrl.trim(),
          wpUsername: username.trim(),
          wpAppPassword: appPassword.trim() || undefined,
          wpPluginApiKey: pluginApiKey.trim() || undefined,
        }),
      });
      const data = (await res.json()) as WpSettings & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save WordPress settings");
      setSettings(data);
      setAppPassword("");
      setPluginApiKey("");
      setSuccess(
        data.wpConfigured
          ? "WordPress connected."
          : "Saved. Add the URL, username and application password to finish connecting.",
      );
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Failed to save WordPress settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="mt-6 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <p className="text-sm text-zinc-500">Loading WordPress settings…</p>
      </section>
    );
  }

  return (
    <form onSubmit={handleSave} className="mt-6 space-y-4">
      <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">WordPress website</h2>
          <span
            className={`text-xs ${settings?.wpConfigured ? "text-emerald-700 dark:text-emerald-300" : "text-zinc-500"}`}
          >
            {settings?.wpConfigured ? "Connected" : "Not connected"}
          </span>
        </div>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          Claude demos are cloned on this WordPress network. Use the site URL
          and an application password (WP Admin → Users → Profile →
          Application Passwords). The user must be a network super-admin.
        </p>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Website URL
            </span>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              placeholder="https://demo.example.com"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Username
            </span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              placeholder="WordPress username"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Application password
            </span>
            <input
              type="password"
              value={appPassword}
              onChange={(e) => setAppPassword(e.target.value)}
              autoComplete="off"
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              placeholder={
                settings?.wpConfigured
                  ? "•••••••• (set a new password)"
                  : "xxxx xxxx xxxx xxxx xxxx xxxx"
              }
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Plugin API key (optional, recommended)
            </span>
            <input
              type="password"
              value={pluginApiKey}
              onChange={(e) => setPluginApiKey(e.target.value)}
              autoComplete="off"
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              placeholder={
                settings?.wpPluginApiKeyConfigured
                  ? "•••••••• (set a new key)"
                  : "from WP Network Admin → LeadGen settings"
              }
            />
            <span className="mt-1 block text-xs text-zinc-500">
              When set, site cloning uses this key (like the demo app) instead
              of the application password.
            </span>
          </label>
        </div>
      </section>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {success && (
        <p className="text-sm text-emerald-700 dark:text-emerald-300">{success}</p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
      >
        {saving ? "Connecting…" : "Save & connect WordPress"}
      </button>
    </form>
  );
}
