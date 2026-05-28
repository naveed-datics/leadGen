"use client";

import { useEffect, useState } from "react";

type LogRow = {
  id: string;
  query: string;
  region: string;
  timestamp: string;
  agent: { id: string; name: string; email: string };
};

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [agentId, setAgentId] = useState("");
  const [region, setRegion] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (agentId.trim()) params.set("agentId", agentId.trim());
      if (region.trim()) params.set("region", region.trim());
      if (from.trim()) params.set("from", from.trim());
      if (to.trim()) params.set("to", to.trim());

      const res = await fetch(`/api/admin/search-logs?${params.toString()}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as { logs?: LogRow[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load logs");
      setLogs(data.logs ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load logs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Search logs
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Audit all agent search activity.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Agent ID
          </span>
          <input
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            placeholder="uuid"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Region
          </span>
          <input
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            placeholder="e.g. Austin, TX"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            From (ISO date/time)
          </span>
          <input
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            placeholder="2026-05-01T00:00:00Z"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            To (ISO date/time)
          </span>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            placeholder="2026-05-28T23:59:59Z"
          />
        </label>

        <div className="sm:col-span-2 flex gap-2">
          <button
            onClick={() => void refresh()}
            className="rounded-md bg-black px-4 py-2 text-sm text-white"
          >
            Apply filters
          </button>
          <button
            onClick={() => {
              setAgentId("");
              setRegion("");
              setFrom("");
              setTo("");
              void setTimeout(() => void refresh(), 0);
            }}
            className="rounded-md border px-4 py-2 text-sm"
          >
            Clear
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
        </div>
      )}

      <div className="mt-6 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">Agent</th>
              <th className="px-4 py-3 font-medium">Region</th>
              <th className="px-4 py-3 font-medium">Query</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-4" colSpan={4}>
                  Loading…
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td className="px-4 py-4" colSpan={4}>
                  No logs.
                </td>
              </tr>
            ) : (
              logs.map((l) => (
                <tr
                  key={l.id}
                  className="border-t border-zinc-200 dark:border-zinc-800"
                >
                  <td className="px-4 py-3 whitespace-nowrap">{l.timestamp}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-zinc-900 dark:text-zinc-50">
                      {l.agent.name}
                    </div>
                    <div className="text-xs text-zinc-600 dark:text-zinc-400">
                      {l.agent.email}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{l.region}</td>
                  <td className="px-4 py-3">{l.query}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

