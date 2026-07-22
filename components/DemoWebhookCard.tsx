"use client";

import { useCallback, useEffect, useState } from "react";

type DemoWebhookSettings = {
  demoWebhookUrl: string | null;
  demoWebhookConfigured: boolean;
};

export function DemoWebhookCard() {
  const [settings, setSettings] = useState<DemoWebhookSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookApiKey, setWebhookApiKey] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    reachable: boolean;
    message: string;
  } | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agent/settings/demo-webhook", {
        cache: "no-store",
      });
      const data = (await res.json()) as DemoWebhookSettings & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load webhook settings");

      setSettings(data);
      setWebhookUrl(data.demoWebhookUrl ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load webhook settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/agent/settings/demo-webhook", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          demoWebhookUrl: webhookUrl.trim(),
          demoWebhookApiKey: webhookApiKey.trim() || undefined,
        }),
      });
      const data = (await res.json()) as DemoWebhookSettings & {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to save webhook settings");

      setSettings(data);
      setWebhookApiKey("");
      setSuccess("Demo webhook settings saved.");
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Failed to save webhook settings");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      const res = await fetch("/api/agent/settings/demo-webhook/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          demoWebhookUrl: webhookUrl.trim() || undefined,
          demoWebhookApiKey: webhookApiKey.trim() || undefined,
        }),
      });
      const data = (await res.json()) as {
        reachable?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to test webhook");
      setTestResult({
        reachable: Boolean(data.reachable),
        message: data.message ?? "Test finished.",
      });
    } catch (e) {
      setTestResult({
        reachable: false,
        message: e instanceof Error ? e.message : "Failed to test webhook",
      });
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <section className="mt-6 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <p className="text-sm text-zinc-500">Loading demo webhook settings…</p>
      </section>
    );
  }

  return (
    <form onSubmit={handleSave} className="mt-6 space-y-4">
      <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-sm font-semibold">Demo webhook</h2>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          Configure the webhook used to generate personalized demo sites for
          proposals.
        </p>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Webhook URL
            </span>
            <input
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              placeholder="https://your-webhook.example.com/demo"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              API key
            </span>
            <input
              type="password"
              value={webhookApiKey}
              onChange={(e) => setWebhookApiKey(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              placeholder={
                settings?.demoWebhookConfigured
                  ? "•••••••• (set a new key)"
                  : "paste API key"
              }
            />
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

      {testResult && (
        <p
          role="status"
          className={
            testResult.reachable
              ? "text-sm text-emerald-700 dark:text-emerald-300"
              : "text-sm text-red-600 dark:text-red-400"
          }
        >
          {testResult.message}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save webhook settings"}
        </button>
        <button
          type="button"
          onClick={() => void handleTest()}
          disabled={testing || !webhookUrl.trim()}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-300"
        >
          {testing ? "Testing…" : "Test webhook"}
        </button>
      </div>
    </form>
  );
}
