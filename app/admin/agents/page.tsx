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

const inputClass =
  "w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-950 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50";

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
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-[-0.035em] text-zinc-900 dark:text-zinc-50">
            Agents
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Manage agent accounts, regions, and feature flags.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by name/email/region"
            className={`${inputClass} sm:w-72`}
            aria-label="Filter agents"
          />
          <button
            onClick={() => setCreateOpen(true)}
            className="whitespace-nowrap rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 active:scale-[0.98]"
          >
            Add agent
          </button>
          <button
            onClick={() => void refresh()}
            className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
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
        <div
          role="status"
          className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100"
        >
          {success}
        </div>
      )}

      {createOpen && (
        <div className="mt-7 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
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
              className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
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
                autoComplete="name"
                className={`mt-2 ${inputClass}`}
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
                  className={`mt-2 ${inputClass}`}
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
                  className={`mt-2 ${inputClass}`}
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
                autoComplete="email"
                className={`mt-2 ${inputClass}`}
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
                autoComplete="new-password"
                className={`mt-2 ${inputClass}`}
                type="password"
                minLength={8}
                required
              />
            </label>

            <div className="sm:col-span-2 flex gap-2">
              <button
                type="submit"
                disabled={creating}
                className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-60"
              >
                {creating ? "Creating…" : "Create agent"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="mt-7 overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <table aria-label="Agents" className="w-full text-left text-sm">
          <thead className="bg-zinc-50/80 text-zinc-500 dark:bg-zinc-950/70 dark:text-zinc-400">
            <tr>
              <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Agent</th>
              <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Region</th>
              <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Active</th>
              <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Search</th>
              <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">WhatsApp</th>
              <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Integrations</th>
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
                  className="border-t border-zinc-100 transition hover:bg-zinc-50/70 dark:border-zinc-800 dark:hover:bg-zinc-800/40"
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
                        aria-label={`Region for ${a.name}`}
                        onChange={(e) =>
                          void toggleAgent(a.id, { region: e.target.value })
                        }
                        className="min-h-9 rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-950"
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
                      a.region ?? "Not assigned"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => void toggleAgent(a.id, { active: !a.active })}
                      aria-pressed={a.active}
                      aria-label={`${a.active ? "Deactivate" : "Activate"} ${a.name}`}
                      className={`min-h-9 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                        a.active
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
                          : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                      }`}
                    >
                      {a.active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() =>
                        void toggleAgent(a.id, { searchEnabled: !a.searchEnabled })
                      }
                      aria-pressed={a.searchEnabled}
                      aria-label={`${a.searchEnabled ? "Disable" : "Enable"} search for ${a.name}`}
                      className={`min-h-9 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                        a.searchEnabled
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
                          : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                      }`}
                    >
                      {a.searchEnabled ? "Enabled" : "Disabled"}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() =>
                        void toggleAgent(a.id, { whatsAppEnabled: !a.whatsAppEnabled })
                      }
                      aria-pressed={a.whatsAppEnabled}
                      aria-label={`${a.whatsAppEnabled ? "Disable" : "Enable"} WhatsApp for ${a.name}`}
                      className={`min-h-9 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                        a.whatsAppEnabled
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
                          : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                      }`}
                    >
                      {a.whatsAppEnabled ? "Enabled" : "Disabled"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <div>SerpApi: {a.serpApiKeyConfigured ? "OK" : "Missing"}</div>
                    <div>WAHA: {a.waConfigured ? "OK" : "Missing"}</div>
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

