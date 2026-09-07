"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type BusinessRow = {
  id: string;
  title: string;
  industry: string;
  location: string;
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

type ListResponse =
  | { items: BusinessRow[]; total: number; limit: number; offset: number }
  | { error: string };

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

export default function BusinessesPage() {
  const [industry, setIndustry] = useState("");
  const [hasWebsite, setHasWebsite] = useState<"any" | "true" | "false">("any");
  const [website, setWebsite] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

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
        <button
          type="button"
          onClick={() => void exportCsv()}
          disabled={exporting || loading}
          className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-60"
        >
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </header>

      <form
        onSubmit={applyFilters}
        className="mt-7 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="block">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Industry
            </span>
            <input
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className={`mt-1.5 ${inputClass}`}
              placeholder="e.g. Dentist"
            />
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
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Website</th>
              <th className="px-4 py-3 font-medium">Search</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-zinc-500">
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-zinc-500">
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
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
