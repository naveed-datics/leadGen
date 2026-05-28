"use client";

import { useEffect, useMemo, useState } from "react";

type AgentRow = {
  id: string;
  name: string;
  email: string;
  region: string | null;
  active: boolean;
  searchEnabled: boolean;
  whatsAppEnabled: boolean;
  serpApiKeyConfigured: boolean;
  waConfigured: boolean;
  createdAt: string;
  updatedAt: string;
};

export default function AdminAgentsPage() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [countries, setCountries] = useState<string[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRegion, setNewRegion] = useState("");
  const [creating, setCreating] = useState(false);

  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return agents;
    return agents.filter(
      (a) =>
        a.name.toLowerCase().includes(needle) ||
        a.email.toLowerCase().includes(needle) ||
        (a.region ?? "").toLowerCase().includes(needle),
    );
  }, [agents, q]);

  async function refresh() {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/admin/agents", { cache: "no-store" });
      const data = (await res.json()) as { agents?: AgentRow[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load agents");
      setAgents(data.agents ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load agents");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadCountries() {
      try {
        const res = await fetch("/api/geo/countries", { cache: "no-store" });
        const data = (await res.json()) as { countries?: string[] };
        if (!res.ok) return;
        const list = Array.isArray(data.countries) ? data.countries : [];
        if (!cancelled) {
          setCountries(list);
          if (!newRegion && list.length > 0) setNewRegion(list[0]);
        }
      } catch {
        // ignore
      }
    }
    void loadCountries();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleAgent(id: string, patch: Partial<AgentRow>) {
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/admin/agents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await res.json()) as { agent?: AgentRow; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function createAgent(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setCreating(true);
    try {
      const res = await fetch("/api/admin/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          email: newEmail,
          password: newPassword,
          region: newRegion,
          active: true,
          searchEnabled: true,
          whatsAppEnabled: false,
        }),
      });
      const data = (await res.json()) as { agent?: AgentRow; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to create agent");
      setSuccess("Agent created.");
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      setNewRegion("");
      setCreateOpen(false);
      await refresh();
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Failed to create agent");
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Agents
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Manage agent accounts, regions, and feature flags.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by name/email/region"
            className="w-full rounded-md border px-3 py-2 text-sm sm:w-72"
          />
          <button
            onClick={() => setCreateOpen(true)}
            className="rounded-md bg-black px-3 py-2 text-sm text-white"
          >
            Add agent
          </button>
          <button
            onClick={() => void refresh()}
            className="rounded-md border px-3 py-2 text-sm"
          >
            Refresh
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

      {success && (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100">
          {success}
        </div>
      )}

      {createOpen && (
        <div className="mt-6 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Add agent
              </h2>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                Create a new agent account and assign a region.
              </p>
            </div>
            <button
              onClick={() => setCreateOpen(false)}
              className="rounded-md border px-3 py-1.5 text-xs"
            >
              Close
            </button>
          </div>

          <form onSubmit={createAgent} className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Name
              </span>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                required
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Country
              </span>
              {countries.length > 0 ? (
                <select
                  value={newRegion}
                  onChange={(e) => setNewRegion(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  required
                >
                  {countries.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={newRegion}
                  onChange={(e) => setNewRegion(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="e.g. Pakistan"
                  required
                />
              )}
            </label>

            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Email
              </span>
              <input
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                type="email"
                required
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Password
              </span>
              <input
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                type="password"
                minLength={8}
                required
              />
            </label>

            <div className="sm:col-span-2 flex gap-2">
              <button
                type="submit"
                disabled={creating}
                className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
              >
                {creating ? "Creating…" : "Create agent"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="mt-6 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-medium">Agent</th>
              <th className="px-4 py-3 font-medium">Region</th>
              <th className="px-4 py-3 font-medium">Active</th>
              <th className="px-4 py-3 font-medium">Search</th>
              <th className="px-4 py-3 font-medium">WhatsApp</th>
              <th className="px-4 py-3 font-medium">Integrations</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-4" colSpan={6}>
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td className="px-4 py-4" colSpan={6}>
                  No agents found.
                </td>
              </tr>
            ) : (
              filtered.map((a) => (
                <tr
                  key={a.id}
                  className="border-t border-zinc-200 dark:border-zinc-800"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-zinc-900 dark:text-zinc-50">
                      {a.name}
                    </div>
                    <div className="text-xs text-zinc-600 dark:text-zinc-400">
                      {a.email}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {countries.length > 0 ? (
                      <select
                        value={a.region ?? ""}
                        onChange={(e) =>
                          void toggleAgent(a.id, { region: e.target.value })
                        }
                        className="rounded-md border px-2 py-1 text-xs"
                      >
                        <option value="" disabled>
                          Select country…
                        </option>
                        {countries.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    ) : (
                      a.region ?? "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => void toggleAgent(a.id, { active: !a.active })}
                      className="rounded-md border px-2 py-1 text-xs"
                    >
                      {a.active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() =>
                        void toggleAgent(a.id, { searchEnabled: !a.searchEnabled })
                      }
                      className="rounded-md border px-2 py-1 text-xs"
                    >
                      {a.searchEnabled ? "Enabled" : "Disabled"}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() =>
                        void toggleAgent(a.id, { whatsAppEnabled: !a.whatsAppEnabled })
                      }
                      className="rounded-md border px-2 py-1 text-xs"
                    >
                      {a.whatsAppEnabled ? "Enabled" : "Disabled"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <div>SerpApi: {a.serpApiKeyConfigured ? "OK" : "Missing"}</div>
                    <div>WA: {a.waConfigured ? "OK" : "Missing"}</div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

