"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type IndustryRow = {
  id: string;
  name: string;
  nameNormalized: string;
  createdAt: string;
  updatedAt: string;
};

export default function AgentIndustriesPage() {
  const [rows, setRows] = useState<IndustryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<IndustryRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const deleteCancelRef = useRef<HTMLButtonElement>(null);
  const successTimeoutRef = useRef<number | null>(null);

  const showSuccess = useCallback((message: string) => {
    setSuccess(message);
    if (successTimeoutRef.current !== null) {
      window.clearTimeout(successTimeoutRef.current);
    }
    successTimeoutRef.current = window.setTimeout(() => {
      setSuccess(null);
      successTimeoutRef.current = null;
    }, 4000);
  }, []);

  useEffect(() => {
    return () => {
      if (successTimeoutRef.current !== null) {
        window.clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agent/industries", { cache: "no-store" });
      const data = (await res.json()) as {
        industries?: IndustryRow[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to load industries");
      setRows(data.industries ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load industries");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!deleteTarget) return;
    deleteCancelRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && deletingId === null) {
        setDeleteTarget(null);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteTarget, deletingId]);

  async function createIndustry(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const res = await fetch("/api/agent/industries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      const data = (await res.json()) as { industry?: IndustryRow; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to create industry");
      setNewName("");
      showSuccess(`Added “${data.industry?.name ?? "industry"}”.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create industry");
    } finally {
      setCreating(false);
    }
  }

  function startEdit(row: IndustryRow) {
    setEditingId(row.id);
    setEditName(row.name);
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
  }

  async function saveEdit(id: string) {
    setError(null);
    setSavingId(id);
    try {
      const res = await fetch(`/api/agent/industries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName }),
      });
      const data = (await res.json()) as { industry?: IndustryRow; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to update industry");
      setEditingId(null);
      setEditName("");
      showSuccess(`Updated “${data.industry?.name ?? "industry"}”.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update industry");
    } finally {
      setSavingId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setError(null);
    setDeletingId(deleteTarget.id);
    try {
      const res = await fetch(`/api/agent/industries/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "Failed to delete industry");
      showSuccess(`Deleted “${deleteTarget.name}”.`);
      setDeleteTarget(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete industry");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6 sm:py-14">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Industries
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Manage the industries you can search. These options appear on the{" "}
          <Link href="/" className="font-medium text-emerald-700 underline dark:text-emerald-400">
            search page
          </Link>
          .
        </p>
      </header>

      <form
        onSubmit={(e) => void createIndustry(e)}
        className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row sm:items-end"
      >
        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Add industry
          </span>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. plumbers, coffee shops"
            required
            disabled={creating}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </label>
        <button
          type="submit"
          disabled={creating || !newName.trim()}
          className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {creating ? "Adding…" : "Add"}
        </button>
      </form>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">
          {success}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading industries…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-6 py-12 text-center dark:border-zinc-800 dark:bg-zinc-900/50">
          <p className="font-medium text-zinc-800 dark:text-zinc-200">
            No industries yet
          </p>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Add at least one industry before running a lead search.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
            <thead className="bg-zinc-50 dark:bg-zinc-950/50">
              <tr>
                <th
                  id="industry-name-header"
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500"
                >
                  Name
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-500"
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {rows.map((row) => {
                const isEditing = editingId === row.id;
                return (
                  <tr key={row.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30">
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            void saveEdit(row.id);
                          }}
                        >
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            disabled={savingId === row.id}
                            aria-label="Edit industry name"
                            className="w-full max-w-md rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                          />
                        </form>
                      ) : (
                        <p className="font-medium text-zinc-900 dark:text-zinc-100">
                          {row.name}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              disabled={savingId === row.id}
                              className="text-sm font-medium text-zinc-600 hover:text-zinc-900 disabled:opacity-60 dark:text-zinc-400 dark:hover:text-zinc-100"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => void saveEdit(row.id)}
                              disabled={savingId === row.id || !editName.trim()}
                              className="text-sm font-medium text-emerald-600 hover:text-emerald-700 disabled:opacity-60 dark:text-emerald-400"
                            >
                              {savingId === row.id ? "Saving…" : "Save"}
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => startEdit(row)}
                              className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(row)}
                              className="text-sm font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => {
            if (deletingId === null) setDeleteTarget(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="delete-dialog-title"
              className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
            >
              Delete industry?
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Remove{" "}
              <span className="font-medium text-zinc-900 dark:text-zinc-200">
                {deleteTarget.name}
              </span>{" "}
              from your search options. Existing saved searches and leads are kept.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                ref={deleteCancelRef}
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deletingId === deleteTarget.id}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={deletingId === deleteTarget.id}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                {deletingId === deleteTarget.id ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
