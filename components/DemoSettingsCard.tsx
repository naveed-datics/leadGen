"use client";

import { useCallback, useEffect, useState } from "react";

type DemoSettings = {
  demoEnabled: boolean;
  wpConfigured: boolean;
  defaultDemoPageId: number | null;
  wpBaseUrl: string | null;
  wpUsername: string | null;
};

type WordPressPage = {
  id: number;
  title: string;
  link: string;
  status: string;
};

export function DemoSettingsCard() {
  const [settings, setSettings] = useState<DemoSettings | null>(null);
  const [pages, setPages] = useState<WordPressPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagesLoading, setPagesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [demoEnabled, setDemoEnabled] = useState(false);
  const [wpBaseUrl, setWpBaseUrl] = useState("");
  const [wpUsername, setWpUsername] = useState("");
  const [wpAppPassword, setWpAppPassword] = useState("");
  const [defaultDemoPageId, setDefaultDemoPageId] = useState<number | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agent/settings/demo", { cache: "no-store" });
      const data = (await res.json()) as DemoSettings & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load demo settings");

      setSettings(data);
      setDemoEnabled(data.demoEnabled);
      setWpBaseUrl(data.wpBaseUrl ?? "");
      setWpUsername(data.wpUsername ?? "");
      setDefaultDemoPageId(data.defaultDemoPageId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load demo settings");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPages = useCallback(async () => {
    setPagesLoading(true);
    try {
      const res = await fetch("/api/agent/settings/demo/pages", {
        cache: "no-store",
      });
      const data = (await res.json()) as {
        pages?: WordPressPage[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to load pages");
      setPages(data.pages ?? []);
    } catch (e) {
      setPages([]);
      setError(e instanceof Error ? e.message : "Failed to load WordPress pages");
    } finally {
      setPagesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (settings?.demoEnabled && settings.wpConfigured) {
      void loadPages();
    }
  }, [settings?.demoEnabled, settings?.wpConfigured, loadPages]);

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
          demoEnabled,
          wpBaseUrl: wpBaseUrl.trim() || undefined,
          wpUsername: wpUsername.trim() || undefined,
          wpAppPassword: wpAppPassword.trim() || undefined,
          defaultDemoPageId,
        }),
      });
      const data = (await res.json()) as DemoSettings & {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to save demo settings");

      setSettings(data);
      setWpAppPassword("");
      setSuccess("Demo settings saved.");
      if (data.demoEnabled && data.wpConfigured) {
        await loadPages();
      }
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Failed to save demo settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="mt-6 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <p className="text-sm text-zinc-500">Loading demo settings…</p>
      </section>
    );
  }

  return (
    <form onSubmit={handleSave} className="mt-6 space-y-4">
      <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-sm font-semibold">Connect website</h2>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          Connect WordPress to clone landing pages into personalized demo sites for
          proposals.
        </p>

        <label className="mt-4 flex items-center gap-2">
          <input
            type="checkbox"
            checked={demoEnabled}
            onChange={(e) => setDemoEnabled(e.target.checked)}
            className="rounded border-zinc-300"
          />
          <span className="text-sm font-medium">Active website</span>
        </label>

        {demoEnabled && (
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                WordPress site URL
              </span>
              <input
                value={wpBaseUrl}
                onChange={(e) => setWpBaseUrl(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                placeholder="https://yoursite.com"
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                WordPress username
              </span>
              <input
                value={wpUsername}
                onChange={(e) => setWpUsername(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                placeholder="admin"
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Application password
              </span>
              <input
                type="password"
                value={wpAppPassword}
                onChange={(e) => setWpAppPassword(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                placeholder={
                  settings?.wpConfigured
                    ? "•••••••• (set a new password)"
                    : "paste application password"
                }
              />
            </label>

            {settings?.wpConfigured && (
              <div className="pt-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Landing pages
                  </h3>
                  <button
                    type="button"
                    onClick={() => void loadPages()}
                    disabled={pagesLoading}
                    className="text-xs font-medium text-emerald-600 hover:text-emerald-700 disabled:opacity-60"
                  >
                    {pagesLoading ? "Refreshing…" : "Refresh"}
                  </button>
                </div>

                {pagesLoading && pages.length === 0 ? (
                  <p className="mt-2 text-xs text-zinc-500">Loading pages…</p>
                ) : pages.length === 0 ? (
                  <p className="mt-2 text-xs text-zinc-500">
                    No pages found. Save credentials first, then refresh.
                  </p>
                ) : (
                  <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded-lg border border-zinc-200 p-2 dark:border-zinc-700">
                    {pages.map((page) => (
                      <li key={page.id} className="flex items-start gap-2 text-sm">
                        <input
                          type="radio"
                          name="defaultDemoPage"
                          checked={defaultDemoPageId === page.id}
                          onChange={() => setDefaultDemoPageId(page.id)}
                          className="mt-1"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-zinc-900 dark:text-zinc-100">
                            {page.title}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {page.status} ·{" "}
                            <a
                              href={page.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-emerald-600 hover:underline"
                            >
                              Preview
                            </a>
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <p className="mt-2 text-xs text-zinc-500">
                  Use {"{{businessName}}"}, {"{{phone}}"}, {"{{industry}}"}, and{" "}
                  {"{{location}}"} in your WordPress page content for replacement
                  when cloning.
                </p>
              </div>
            )}
          </div>
        )}
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
        {saving ? "Saving…" : "Save demo settings"}
      </button>
    </form>
  );
}
