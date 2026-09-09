"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { parseCityFromAddress } from "@/lib/geo/parse-city";

type BusinessRow = {
  id: string;
  title: string;
  industry: string;
  location: string;
  city: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  hasWebsite: boolean;
  address: string | null;
  rating: number | null;
  reviews: number | null;
  mapsUrl: string | null;
  searchId: string;
  createdAt: string;
};

type IndustryOption = {
  id: string;
  name: string;
};

type ListResponse =
  | { items: BusinessRow[]; total: number; limit: number; offset: number }
  | { error: string };

type EditForm = {
  title: string;
  phone: string;
  email: string;
  website: string;
  address: string;
};

type CheckNoWebsiteResponse = {
  complete: boolean;
  resumeAfter?: string;
  checked: number;
  remainingEstimate?: number;
  results?: Record<string, boolean>;
  error?: string;
};

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

export default function BusinessesPage() {
  const [industry, setIndustry] = useState("");
  const [hasWebsite, setHasWebsite] = useState<"any" | "true" | "false">("any");
  const [website, setWebsite] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [industries, setIndustries] = useState<IndustryOption[]>([]);

  const [applied, setApplied] = useState({
    industry: "",
    hasWebsite: "any" as "any" | "true" | "false",
    website: "",
    phone: "",
    email: "",
  });

  const [items, setItems] = useState<BusinessRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const [checkingWhatsapp, setCheckingWhatsapp] = useState(false);
  const [whatsappCheckedTotal, setWhatsappCheckedTotal] = useState(0);
  const [whatsappStatus, setWhatsappStatus] = useState<string | null>(null);

  const [editing, setEditing] = useState<BusinessRow | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    title: "",
    phone: "",
    email: "",
    website: "",
    address: "",
  });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BusinessRow | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (applied.industry.trim()) params.set("industry", applied.industry.trim());
    if (applied.hasWebsite !== "any") params.set("hasWebsite", applied.hasWebsite);
    if (applied.website.trim()) params.set("website", applied.website.trim());
    if (applied.phone.trim()) params.set("phone", applied.phone.trim());
    if (applied.email.trim()) params.set("email", applied.email.trim());
    params.set("limit", "200");
    return params.toString();
  }, [applied]);

  useEffect(() => {
    let cancelled = false;
    async function loadIndustries() {
      try {
        const res = await fetch("/api/agent/industries", { cache: "no-store" });
        const data = (await res.json()) as {
          industries?: IndustryOption[];
          error?: string;
        };
        if (cancelled || !res.ok || !Array.isArray(data.industries)) return;
        setIndustries(data.industries);
      } catch {
        // ignore — dropdown stays empty / All only
      }
    }
    void loadIndustries();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/businesses?${queryString}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as ListResponse;
      if (!res.ok || "error" in data) {
        setError("error" in data ? data.error : "Failed to load businesses");
        setItems([]);
        setTotal(0);
        return;
      }
      setItems(data.items);
      setTotal(data.total);
    } catch {
      setError("Network error");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    void load();
  }, [load]);

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    setApplied({
      industry,
      hasWebsite,
      website,
      phone,
      email,
    });
  }

  function clearFilters() {
    setIndustry("");
    setHasWebsite("any");
    setWebsite("");
    setPhone("");
    setEmail("");
    setApplied({
      industry: "",
      hasWebsite: "any",
      website: "",
      phone: "",
      email: "",
    });
  }

  function openEdit(row: BusinessRow) {
    setEditing(row);
    setEditForm({
      title: row.title,
      phone: row.phone ?? "",
      email: row.email ?? "",
      website: row.website ?? "",
      address: row.address ?? "",
    });
    setError(null);
  }

  function closeEdit() {
    if (saving) return;
    setEditing(null);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    if (!editForm.title.trim()) {
      setError("Title is required");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/businesses/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editForm.title.trim(),
          phone: editForm.phone.trim() || null,
          email: editForm.email.trim() || null,
          website: editForm.website.trim() || null,
          address: editForm.address.trim() || null,
        }),
      });
      const data = (await res.json()) as {
        business?: {
          id: string;
          title: string;
          phone: string | null;
          email: string | null;
          website: string | null;
          hasWebsite: boolean;
          address: string | null;
        };
        error?: string;
      };
      if (!res.ok || !data.business) {
        setError(data.error ?? "Failed to update business");
        return;
      }

      const nextAddress = data.business.address;
      setItems((prev) =>
        prev.map((item) =>
          item.id === editing.id
            ? {
                ...item,
                title: data.business!.title,
                phone: data.business!.phone,
                email: data.business!.email,
                website: data.business!.website,
                hasWebsite: data.business!.hasWebsite,
                address: nextAddress,
                city: parseCityFromAddress(nextAddress),
              }
            : item,
        ),
      );
      setEditing(null);
    } catch {
      setError("Network error while saving");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    setError(null);
    try {
      const res = await fetch(`/api/businesses/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!res.ok) {
        setError(data?.error ?? "Failed to delete business");
        return;
      }
      setItems((prev) => prev.filter((item) => item.id !== deleteTarget.id));
      setTotal((prev) => Math.max(0, prev - 1));
      setDeleteTarget(null);
    } catch {
      setError("Network error while deleting");
    } finally {
      setDeletingId(null);
    }
  }

  async function exportCsv() {
    setExporting(true);
    setError(null);
    try {
      const params = new URLSearchParams(queryString);
      params.set("format", "csv");
      params.delete("limit");
      const res = await fetch(`/api/businesses?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Export failed");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `businesses-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Network error while exporting");
    } finally {
      setExporting(false);
    }
  }

  async function checkWhatsappNoWebsite() {
    setCheckingWhatsapp(true);
    setError(null);
    setWhatsappCheckedTotal(0);
    setWhatsappStatus("Starting WhatsApp check…");

    let resumeAfter: string | undefined;
    let totalChecked = 0;

    try {
      for (;;) {
        const res = await fetch("/api/whatsapp/check-no-website", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(resumeAfter ? { resumeAfter } : {}),
        });
        const data = (await res.json()) as CheckNoWebsiteResponse;
        if (!res.ok) {
          setError(data.error ?? "WhatsApp check failed");
          setWhatsappStatus(null);
          return;
        }

        totalChecked += data.checked ?? 0;
        setWhatsappCheckedTotal(totalChecked);

        const remaining = data.remainingEstimate ?? 0;
        if (data.complete) {
          setWhatsappStatus(
            totalChecked === 0
              ? "No unchecked no-website leads with a phone number."
              : `Done. Checked ${totalChecked} lead${totalChecked === 1 ? "" : "s"}.`,
          );
          return;
        }

        setWhatsappStatus(
          `Checked ${totalChecked}… ${remaining} remaining`,
        );
        resumeAfter = data.resumeAfter;
        if (!resumeAfter) {
          setError("Check paused without a resume point. Try again.");
          setWhatsappStatus(null);
          return;
        }
      }
    } catch {
      setError("Network error while checking WhatsApp");
      setWhatsappStatus(null);
    } finally {
      setCheckingWhatsapp(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-[-0.035em] text-zinc-900 dark:text-zinc-50">
            Business
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            All businesses from your saved searches. Filter above, then export CSV.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void checkWhatsappNoWebsite()}
            disabled={checkingWhatsapp || loading}
            className="rounded-xl border border-emerald-700 px-4 py-2.5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50 disabled:opacity-60 dark:border-emerald-500 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
          >
            {checkingWhatsapp
              ? `Checking… (${whatsappCheckedTotal})`
              : "Check WhatsApp (no website)"}
          </button>
          <button
            type="button"
            onClick={() => void exportCsv()}
            disabled={exporting || loading || checkingWhatsapp}
            className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-60"
          >
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
        </div>
      </header>

      {whatsappStatus && (
        <div
          role="status"
          className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100"
        >
          {whatsappStatus}
        </div>
      )}

      <form
        onSubmit={applyFilters}
        className="mt-7 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="block">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Industry
            </span>
            <select
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className={`mt-1.5 ${inputClass}`}
            >
              <option value="">All industries</option>
              {industries.map((opt) => (
                <option key={opt.id} value={opt.name}>
                  {opt.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Has website
            </span>
            <select
              value={hasWebsite}
              onChange={(e) =>
                setHasWebsite(e.target.value as "any" | "true" | "false")
              }
              className={`mt-1.5 ${inputClass}`}
            >
              <option value="any">Any</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Website contains
            </span>
            <input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className={`mt-1.5 ${inputClass}`}
              placeholder="example.com"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Phone contains
            </span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={`mt-1.5 ${inputClass}`}
              placeholder="555"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Email contains
            </span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`mt-1.5 ${inputClass}`}
              placeholder="@gmail.com"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="submit"
            className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Apply filters
          </button>
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
          >
            Clear
          </button>
        </div>
      </form>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
        </div>
      )}

      <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
        {loading ? "Loading…" : `${total} business${total === 1 ? "" : "es"}`}
        {!loading && items.length < total
          ? ` (showing ${items.length})`
          : null}
      </p>

      <div className="mt-3 overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/60">
            <tr>
              <th className="px-4 py-3 font-medium">Business</th>
              <th className="px-4 py-3 font-medium">Industry</th>
              <th className="px-4 py-3 font-medium">Location</th>
              <th className="px-4 py-3 font-medium">City</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Website</th>
              <th className="px-4 py-3 font-medium">Search</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-zinc-500">
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-zinc-500">
                  No businesses match these filters.
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr
                  key={row.id}
                  className="border-t border-zinc-100 dark:border-zinc-800"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-zinc-900 dark:text-zinc-50">
                      {row.mapsUrl ? (
                        <a
                          href={row.mapsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="underline-offset-2 hover:underline"
                        >
                          {row.title}
                        </a>
                      ) : (
                        row.title
                      )}
                    </div>
                    {row.address ? (
                      <div className="mt-0.5 text-xs text-zinc-500">{row.address}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                    {row.industry}
                  </td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                    {row.location}
                  </td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                    {row.city ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                    {row.phone ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                    {row.email ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {row.website ? (
                      <a
                        href={row.website}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
                      >
                        {row.website.replace(/^https?:\/\//, "")}
                      </a>
                    ) : (
                      <span className="text-zinc-400">No website</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/searches/${row.searchId}`}
                      className="text-xs font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
                    >
                      Open
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(row)}
                        disabled={deletingId === row.id}
                        className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-business-title"
        >
          <form
            onSubmit={(e) => void saveEdit(e)}
            className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
          >
            <h2
              id="edit-business-title"
              className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
            >
              Edit business
            </h2>
            <div className="mt-4 grid gap-3">
              <label className="block">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Title
                </span>
                <input
                  required
                  value={editForm.title}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, title: e.target.value }))
                  }
                  className={`mt-1.5 ${inputClass}`}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Phone
                </span>
                <input
                  value={editForm.phone}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, phone: e.target.value }))
                  }
                  className={`mt-1.5 ${inputClass}`}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Email
                </span>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, email: e.target.value }))
                  }
                  className={`mt-1.5 ${inputClass}`}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Website
                </span>
                <input
                  value={editForm.website}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, website: e.target.value }))
                  }
                  className={`mt-1.5 ${inputClass}`}
                  placeholder="https://"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Address
                </span>
                <input
                  value={editForm.address}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, address: e.target.value }))
                  }
                  className={`mt-1.5 ${inputClass}`}
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeEdit}
                disabled={saving}
                className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-business-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <h2
              id="delete-business-title"
              className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
            >
              Delete business?
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              This removes <span className="font-medium">{deleteTarget.title}</span>{" "}
              from the directory. Linked outreach leads for this business are also
              removed.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deletingId === deleteTarget.id}
                className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={deletingId === deleteTarget.id}
                className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
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
