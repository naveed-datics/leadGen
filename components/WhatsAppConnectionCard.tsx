"use client";

import { useCallback, useEffect, useState } from "react";

type ConnectionState = {
  configured: boolean;
  whatsAppEnabled: boolean;
  session: string;
  status: string;
  connected: boolean;
  linkedName: string | null;
  linkedPhone: string | null;
  webhookUrl: string;
  webhookConfigured?: boolean;
  webhookReachabilityWarning?: string | null;
  dashboardUrl: string | null;
  conversationCount: number;
};

export function WhatsAppConnectionCard() {
  const [connection, setConnection] = useState<ConnectionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrNotice, setQrNotice] = useState<string | null>(null);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    setError(null);
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/agent/whatsapp/connection", {
        cache: "no-store",
      });
      const data = (await res.json()) as ConnectionState & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load WhatsApp connection");
      setConnection(data);
      if (data.connected) setQrDataUrl(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load WhatsApp connection");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!qrDataUrl || connection?.connected) return;
    const interval = window.setInterval(() => {
      void load({ silent: true });
    }, 4000);
    return () => window.clearInterval(interval);
  }, [qrDataUrl, connection?.connected, load]);

  async function reconnect() {
    setActionLoading("reconnect");
    setError(null);
    setQrNotice(null);
    try {
      const res = await fetch("/api/agent/whatsapp/connection/reconnect", {
        method: "POST",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to reconnect session");
      setQrDataUrl(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reconnect session");
    } finally {
      setActionLoading(null);
    }
  }

  async function showQr() {
    setActionLoading("qr");
    setError(null);
    setQrNotice(null);
    try {
      const res = await fetch("/api/agent/whatsapp/connection/qr", {
        cache: "no-store",
      });
      const data = (await res.json()) as {
        qrDataUrl?: string;
        error?: string;
        alreadyLinked?: boolean;
      };
      if (res.status === 409 || data.alreadyLinked) {
        setQrNotice(
          "Session is already linked. Disconnect to scan a new QR code. Use Disconnect above, then Show QR code again.",
        );
        setQrDataUrl(null);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Failed to load QR code");
      setQrDataUrl(data.qrDataUrl ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load QR code");
    } finally {
      setActionLoading(null);
    }
  }

  async function disconnect() {
    setActionLoading("disconnect");
    setError(null);
    setQrNotice(null);
    try {
      const res = await fetch("/api/agent/whatsapp/connection/disconnect", {
        method: "POST",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to disconnect");
      setQrDataUrl(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to disconnect");
    } finally {
      setActionLoading(null);
    }
  }

  async function syncWebhook() {
    setActionLoading("sync-webhook");
    setError(null);
    try {
      const res = await fetch("/api/agent/whatsapp/connection/sync-webhook", {
        method: "POST",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to register webhook");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to register webhook");
    } finally {
      setActionLoading(null);
    }
  }

  const connected = connection?.connected ?? false;
  const statusLabel = connection?.status ?? "UNKNOWN";

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            WhatsApp connection
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            Link your business number to receive messages, qualify leads, and use
            the dashboard.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {connected ? (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
              Connected
            </span>
          ) : (
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
              Not connected
            </span>
          )}
          {connection && (
            <span className="text-xs text-zinc-500">
              {connection.conversationCount} conversation
              {connection.conversationCount === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <p className="mt-5 text-sm text-zinc-500">Loading connection status…</p>
      ) : connection ? (
        <>
          <div className="mt-5 space-y-4 text-sm">
            {!connection.configured ? (
              <p className="text-zinc-600 dark:text-zinc-400">
                WAHA is not configured on this server. Ask an admin to set
                WAHA_BASE_URL, then refresh this page.
              </p>
            ) : connected ? (
              <p className="text-zinc-700 dark:text-zinc-300">
                Your WhatsApp is linked.{" "}
                {connection.dashboardUrl ? (
                  <a
                    href={connection.dashboardUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    Open dashboard
                  </a>
                ) : null}
              </p>
            ) : (
              <p className="text-zinc-700 dark:text-zinc-300">
                Scan the QR code with WhatsApp on your phone to link this session.
              </p>
            )}

            {connection.configured && !connection.whatsAppEnabled && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                WhatsApp sending is disabled by admin. You can still link your number
                here — ask an admin to enable WhatsApp once you are connected.
              </div>
            )}

            {connection.webhookReachabilityWarning && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                {connection.webhookReachabilityWarning}
              </div>
            )}

            {connection.configured &&
              connection.webhookUrl &&
              connection.webhookConfigured === false &&
              !connection.webhookReachabilityWarning && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                  Inbound webhook is not registered on the WAHA session. Click
                  &quot;Register webhook&quot; so replies appear in chat.
                </div>
              )}

            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-zinc-500">Status</dt>
                <dd className="mt-1 font-medium text-zinc-900 dark:text-zinc-50">
                  {statusLabel}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-zinc-500">Linked</dt>
                <dd className="mt-1 font-medium text-zinc-900 dark:text-zinc-50">
                  {connection.linkedName && connection.linkedPhone
                    ? `${connection.linkedName} (${connection.linkedPhone})`
                    : "—"}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-wide text-zinc-500">Webhook</dt>
                <dd className="mt-1 break-all font-mono text-xs text-zinc-700 dark:text-zinc-300">
                  {connection.webhookUrl || "—"}
                </dd>
                {connection.webhookUrl && (
                  <dd className="mt-2">
                    <a
                      href="/agent/settings/inbound-webhook-test"
                      className="text-xs font-medium text-sky-700 hover:underline dark:text-sky-300"
                    >
                      Test inbound locally →
                    </a>
                  </dd>
                )}
              </div>
            </dl>
          </div>

          {connection.configured && (
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void syncWebhook()}
                disabled={Boolean(actionLoading) || !connection.webhookUrl}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200"
              >
                {actionLoading === "sync-webhook"
                  ? "Registering…"
                  : "Register webhook"}
              </button>
              <button
                type="button"
                onClick={() => void reconnect()}
                disabled={Boolean(actionLoading)}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {actionLoading === "reconnect" ? "Reconnecting…" : "Reconnect session"}
              </button>
              <button
                type="button"
                onClick={() => void showQr()}
                disabled={Boolean(actionLoading)}
                className="rounded-md border border-emerald-600 px-4 py-2 text-sm font-medium text-emerald-700 disabled:opacity-60 dark:text-emerald-400"
              >
                {actionLoading === "qr" ? "Loading QR…" : "Show QR code"}
              </button>
              {connected && (
                <button
                  type="button"
                  onClick={() => void disconnect()}
                  disabled={Boolean(actionLoading)}
                  className="rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-60 dark:border-red-900/50 dark:text-red-300"
                >
                  {actionLoading === "disconnect" ? "Disconnecting…" : "Disconnect"}
                </button>
              )}
            </div>
          )}

          {qrNotice && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
              {qrNotice}
            </div>
          )}

          {qrDataUrl && (
            <div className="mt-4 flex flex-col items-start gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Open WhatsApp → Linked devices → Link a device, then scan this code.
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl}
                alt="WhatsApp QR code"
                className="h-56 w-56 rounded-md border border-zinc-200 bg-white p-2 dark:border-zinc-800"
              />
            </div>
          )}
        </>
      ) : null}

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
        </div>
      )}
    </section>
  );
}
