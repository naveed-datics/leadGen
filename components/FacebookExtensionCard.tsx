"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type TokenState = { enabled: boolean; hasToken: boolean; dailyCap: number };

export function FacebookExtensionCard() {
  const [state, setState] = useState<TokenState | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/agent/social/token", { cache: "no-store" });
      const data = (await res.json()) as TokenState & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load extension status");
      setState(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load extension status");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/agent/social/token", { method: "POST" });
      const data = (await res.json()) as { token?: string; error?: string };
      if (!res.ok || !data.token) throw new Error(data.error ?? "Failed to create token");
      setNewToken(data.token);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create token");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/agent/social/token", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to revoke token");
      setNewToken(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke token");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-base font-semibold">Facebook outreach extension</h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        A Chrome extension sends approved DMs from your own logged-in Facebook, up to{" "}
        {state?.dailyCap ?? 10} a day. Load the <code>extension/</code> folder via
        chrome://extensions (Developer mode, Load unpacked), then paste this app&apos;s
        URL and a token below.
      </p>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      {state && !state.enabled ? (
        <p className="mt-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Disabled by admin.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={generate}
              className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-60"
            >
              {state?.hasToken ? "Rotate token" : "Generate token"}
            </button>
            {state?.hasToken && (
              <button
                type="button"
                disabled={busy}
                onClick={revoke}
                className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold transition hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Revoke
              </button>
            )}
            <Link
              href="/agent/social-outreach"
              className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold transition hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Open outreach queue
            </Link>
          </div>
          {newToken && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900/50 dark:bg-amber-950/30">
              <p className="font-medium">Copy this token now. It won&apos;t be shown again.</p>
              <code className="mt-2 block break-all text-xs">{newToken}</code>
            </div>
          )}
          <p className="text-xs text-zinc-500">
            Token status: {state?.hasToken ? "active" : "none"}
          </p>
        </div>
      )}
    </section>
  );
}
