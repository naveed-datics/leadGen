"use client";

import { useCallback, useEffect, useState } from "react";

type ClaudeSettings = {
  claudeRoutineUrl: string | null;
  claudeBetaHeader: string | null;
  claudeDryRun: boolean;
  claudeTokenConfigured: boolean;
  claudeConfigured: boolean;
  demoProvider: "demoapp" | "claude";
};

export function ClaudeSettingsCard({
  onProviderChange,
}: {
  /** Called with the saved demo mode on load and after every save. */
  onProviderChange?: (provider: "demoapp" | "claude") => void;
}) {
  const [settings, setSettings] = useState<ClaudeSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [betaHeader, setBetaHeader] = useState("");
  const [dryRun, setDryRun] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
    details?: string;
  } | null>(null);
  const [provider, setProvider] = useState<"demoapp" | "claude">("demoapp");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agent/settings/claude", { cache: "no-store" });
      const data = (await res.json()) as ClaudeSettings & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load Claude settings");
      setSettings(data);
      setUrl(data.claudeRoutineUrl ?? "");
      setBetaHeader(data.claudeBetaHeader ?? "");
      setDryRun(data.claudeDryRun);
      setProvider(data.demoProvider);
      onProviderChange?.(data.demoProvider);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Claude settings");
    } finally {
      setLoading(false);
    }
  }, [onProviderChange]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/agent/settings/claude", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claudeRoutineUrl: url.trim(),
          claudeRoutineToken: token.trim() || undefined,
          claudeBetaHeader: betaHeader.trim(),
          claudeDryRun: dryRun,
          demoProvider: provider,
        }),
      });
      const data = (await res.json()) as ClaudeSettings & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save Claude settings");
      setSettings(data);
      setProvider(data.demoProvider);
      onProviderChange?.(data.demoProvider);
      setToken("");
      setSuccess("Claude settings saved.");
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Failed to save Claude settings");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/agent/settings/claude/test", {
        method: "POST",
      });
      const data = (await res.json()) as {
        message?: string;
        error?: string;
        response?: unknown;
      };
      if (!res.ok) throw new Error(data.error ?? "Routine test failed");
      setTestResult({
        ok: true,
        message: data.message ?? "Routine triggered.",
        details: data.response ? JSON.stringify(data.response, null, 2) : undefined,
      });
    } catch (e) {
      setTestResult({
        ok: false,
        message: e instanceof Error ? e.message : "Routine test failed",
      });
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <section className="mt-6 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <p className="text-sm text-zinc-500">Loading Claude settings…</p>
      </section>
    );
  }

  const canSelectClaude =
    Boolean(settings?.claudeConfigured) || Boolean(url.trim() && (token.trim() || settings?.claudeTokenConfigured));

  return (
    <form onSubmit={handleSave} className="mt-6 space-y-4">
      <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-sm font-semibold">Active Demo Mode</h2>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          Create demos with a Claude routine instead of the demo app. LeadGen
          clones the WordPress template itself, then fires your routine with the
          job. Only one demo mode is active at a time.
        </p>

        <fieldset className="mt-4">
          <legend className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Demo mode
          </legend>
          <div className="mt-2 flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="demoProvider"
                checked={provider === "demoapp"}
                onChange={() => setProvider("demoapp")}
              />
              Demo app
            </label>
            <label
              className={`flex items-center gap-2 ${canSelectClaude ? "" : "opacity-50"}`}
            >
              <input
                type="radio"
                name="demoProvider"
                disabled={!canSelectClaude}
                checked={provider === "claude"}
                onChange={() => setProvider("claude")}
              />
              Claude
            </label>
          </div>
          {!canSelectClaude && (
            <p className="mt-1 text-xs text-zinc-500">
              Add an endpoint and token below to enable Claude.
            </p>
          )}
        </fieldset>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Endpoint
            </span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 font-mono text-xs"
              placeholder="https://api.anthropic.com/v1/claude_code/routines/trig_…/fire"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Bearer token
            </span>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              placeholder={
                settings?.claudeTokenConfigured
                  ? "•••••••• (set a new token)"
                  : "paste routine token"
              }
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              anthropic-beta header (optional)
            </span>
            <input
              value={betaHeader}
              onChange={(e) => setBetaHeader(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              placeholder="default: experimental-cc-routine-2026-04-01"
            />
          </label>
        </div>

        <label className="mt-4 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={dryRun}
            onChange={(e) => setDryRun(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Dry run
            <span className="block text-xs text-zinc-500">
              Sent to the routine as <code>dry_run</code>. Leave on while
              testing; turn off to let Claude make real changes.
            </span>
          </span>
        </label>

        <p className="mt-3 text-xs text-zinc-500">
          Demo cloning uses your WordPress credentials in Settings; that WP user
          must be a network super-admin.
        </p>
      </section>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {success && (
        <p className="text-sm text-emerald-700 dark:text-emerald-300">{success}</p>
      )}

      {testResult && (
        <div role="status" className="text-sm">
          <p
            className={
              testResult.ok
                ? "text-emerald-700 dark:text-emerald-300"
                : "text-red-600 dark:text-red-400"
            }
          >
            {testResult.message}
          </p>
          {testResult.details && (
            <pre className="mt-2 max-h-48 overflow-auto rounded bg-zinc-100 p-2 text-xs dark:bg-zinc-800">
              {testResult.details}
            </pre>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save Claude settings"}
        </button>
        <button
          type="button"
          onClick={() => void handleTest()}
          disabled={testing || !settings?.claudeConfigured}
          title="Fires the saved routine once with a dry-run sample job. Save settings first."
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-300"
        >
          {testing ? "Triggering…" : "Test routine (dry run)"}
        </button>
      </div>
    </form>
  );
}
