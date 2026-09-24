"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type WhatsappFilter = "any" | "true" | "false" | "unchecked";
type SocialsFilter = "any" | "true" | "false";
type WebsiteFilter = "any" | "true" | "false";
type RatingFilter = "any" | "4.5" | "4" | "3.5" | "3";
type WebsiteStateFilter =
  | "any"
  | "ok"
  | "down"
  | "blocked"
  | "error"
  | "unchecked"
  | "copyright_2023"
  | "copyright_2022"
  | "copyright_2021"
  | "copyright_2020";

const COPYRIGHT_MAX_YEAR: Partial<Record<WebsiteStateFilter, number>> = {
  copyright_2023: 2023,
  copyright_2022: 2022,
  copyright_2021: 2021,
  copyright_2020: 2020,
};

const PAGE_SIZE = 50;

type BusinessRow = {
  id: string;
  title: string;
  industry: string;
  location: string;
  phone: string | null;
  website: string | null;
  hasWebsite: boolean;
  address: string | null;
  rating: number | null;
  reviews: number | null;
};

type ListResponse =
  | { items: BusinessRow[]; total: number; limit: number; offset: number }
  | { error: string };

type CreateCampaignResponse =
  | { campaign: { id: string } }
  | { error: string; businessIds?: string[] };

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

export default function NewCampaignPage() {
  const router = useRouter();

  const [industry, setIndustry] = useState("");
  const [hasWebsite, setHasWebsite] = useState<WebsiteFilter>("any");
  const [website, setWebsite] = useState("");
  const [phone, setPhone] = useState("");
  const [hasWhatsapp, setHasWhatsapp] = useState<WhatsappFilter>("any");
  const [hasSocials, setHasSocials] = useState<SocialsFilter>("any");
  const [websiteStateFilter, setWebsiteStateFilter] =
    useState<WebsiteStateFilter>("any");
  const [location, setLocation] = useState("");
  const [industries, setIndustries] = useState<string[]>([]);
  const [minRating, setMinRating] = useState<RatingFilter>("any");

  const [applied, setApplied] = useState({
    industry: "",
    hasWebsite: "any" as WebsiteFilter,
    website: "",
    phone: "",
    hasWhatsapp: "any" as WhatsappFilter,
    hasSocials: "any" as SocialsFilter,
    websiteState: "any" as WebsiteStateFilter,
    location: "",
    minRating: "any" as RatingFilter,
  });

  const [page, setPage] = useState(0);
  const [items, setItems] = useState<BusinessRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [conflictIds, setConflictIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    async function loadIndustries() {
      try {
        const res = await fetch("/api/businesses/industries", {
          cache: "no-store",
        });
        const data = (await res.json()) as {
          industries?: string[];
          error?: string;
        };
        if (cancelled || !res.ok || !Array.isArray(data.industries)) return;
        setIndustries(data.industries);
      } catch {
        // ignore
      }
    }
    void loadIndustries();
    return () => {
      cancelled = true;
    };
  }, []);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (applied.industry.trim()) params.set("industry", applied.industry.trim());
    if (applied.hasWebsite !== "any") params.set("hasWebsite", applied.hasWebsite);
    if (applied.website.trim()) params.set("website", applied.website.trim());
    if (applied.phone.trim()) params.set("phone", applied.phone.trim());
    if (applied.hasWhatsapp !== "any") params.set("hasWhatsapp", applied.hasWhatsapp);
    if (applied.hasSocials !== "any") params.set("hasSocials", applied.hasSocials);
    if (applied.websiteState !== "any") {
      const copyrightMaxYear = COPYRIGHT_MAX_YEAR[applied.websiteState];
      if (copyrightMaxYear != null) {
        params.set("copyrightMaxYear", String(copyrightMaxYear));
      } else {
        params.set("websiteState", applied.websiteState);
      }
    }
    if (applied.location.trim()) params.set("location", applied.location.trim());
    if (applied.minRating !== "any") params.set("minRating", applied.minRating);
    params.set("excludeCampaigned", "true");
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(page * PAGE_SIZE));
    return params.toString();
  }, [applied, page]);

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
    setPage(0);
    setApplied({
      industry,
      hasWebsite,
      website,
      phone,
      hasWhatsapp,
      hasSocials,
      websiteState: websiteStateFilter,
      location,
      minRating,
    });
  }

  function clearFilters() {
    setIndustry("");
    setHasWebsite("any");
    setWebsite("");
    setPhone("");
    setHasWhatsapp("any");
    setHasSocials("any");
    setWebsiteStateFilter("any");
    setLocation("");
    setMinRating("any");
    setPage(0);
    setApplied({
      industry: "",
      hasWebsite: "any",
      website: "",
      phone: "",
      hasWhatsapp: "any",
      hasSocials: "any",
      websiteState: "any",
      location: "",
      minRating: "any",
    });
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllOnPage() {
    const pageIds = items.map((item) => item.id);
    const allSelected = pageIds.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const id of pageIds) next.delete(id);
      } else {
        for (const id of pageIds) next.add(id);
      }
      return next;
    });
  }

  async function createCampaign() {
    if (!name.trim() || selected.size === 0) return;
    setSubmitting(true);
    setError(null);
    setConflictIds(new Set());
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          businessIds: [...selected],
        }),
      });
      const data = (await res.json()) as CreateCampaignResponse;
      if (!res.ok || "error" in data) {
        if (res.status === 409 && "businessIds" in data && data.businessIds) {
          setConflictIds(new Set(data.businessIds));
        }
        setError("error" in data ? data.error : "Failed to create campaign");
        return;
      }
      router.push(`/campaigns/${data.campaign.id}`);
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  const allOnPageSelected =
    items.length > 0 && items.every((item) => selected.has(item.id));

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
      <header>
        <Link
          href="/campaigns"
          className="inline-flex text-sm font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
        >
          ← Back to campaigns
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-[-0.035em] text-zinc-900 dark:text-zinc-50">
          Create Campaign
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Filter businesses below, select the ones to include, then create the
          campaign. Businesses already in another active campaign are hidden.
        </p>
      </header>

      <div className="mt-6 grid gap-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:grid-cols-2 dark:border-zinc-800 dark:bg-zinc-900">
        <label className="block">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Campaign name
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`mt-1.5 ${inputClass}`}
            placeholder="e.g. Q3 Salons Outreach"
            maxLength={120}
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Description (optional)
          </span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={`mt-1.5 ${inputClass}`}
            maxLength={500}
          />
        </label>
      </div>

      <form
        onSubmit={applyFilters}
        className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
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
              {industries.map((name) => (
                <option key={name} value={name}>
                  {name}
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
              onChange={(e) => setHasWebsite(e.target.value as WebsiteFilter)}
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
              WhatsApp
            </span>
            <select
              value={hasWhatsapp}
              onChange={(e) => setHasWhatsapp(e.target.value as WhatsappFilter)}
              className={`mt-1.5 ${inputClass}`}
            >
              <option value="any">Any</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
              <option value="unchecked">Unchecked</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Have socials
            </span>
            <select
              value={hasSocials}
              onChange={(e) => setHasSocials(e.target.value as SocialsFilter)}
              className={`mt-1.5 ${inputClass}`}
            >
              <option value="any">Any</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Website status
            </span>
            <select
              value={websiteStateFilter}
              onChange={(e) =>
                setWebsiteStateFilter(e.target.value as WebsiteStateFilter)
              }
              className={`mt-1.5 ${inputClass}`}
            >
              <option value="any">Any</option>
              <option value="ok">OK</option>
              <option value="down">Down</option>
              <option value="blocked">Blocked</option>
              <option value="error">Error</option>
              <option value="unchecked">Unchecked</option>
              <option value="copyright_2023">Copyright ≤ 2023</option>
              <option value="copyright_2022">Copyright ≤ 2022</option>
              <option value="copyright_2021">Copyright ≤ 2021</option>
              <option value="copyright_2020">Copyright ≤ 2020</option>
            </select>
          </label>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Location
            </span>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className={`mt-1.5 ${inputClass}`}
              placeholder="Zip code or city"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Min rating
            </span>
            <select
              value={minRating}
              onChange={(e) => setMinRating(e.target.value as RatingFilter)}
              className={`mt-1.5 ${inputClass}`}
            >
              <option value="any">Any</option>
              <option value="4.5">4.5+</option>
              <option value="4">4+</option>
              <option value="3.5">3.5+</option>
              <option value="3">3+</option>
            </select>
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

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {loading ? "Loading…" : `${total} available business${total === 1 ? "" : "es"}`}
          {" · "}
          {selected.size} selected
        </p>
        <button
          type="button"
          onClick={() => void createCampaign()}
          disabled={!name.trim() || selected.size === 0 || submitting}
          className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-60"
        >
          {submitting ? "Creating…" : `Create Campaign (${selected.size})`}
        </button>
      </div>

      <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/60">
            <tr>
              <th className="w-[5%] px-3 py-3 font-medium">
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={toggleAllOnPage}
                  aria-label="Select all on page"
                />
              </th>
              <th className="w-[22%] px-3 py-3 font-medium">Business</th>
              <th className="w-[13%] px-3 py-3 font-medium">Industry</th>
              <th className="w-[13%] px-3 py-3 font-medium">Location</th>
              <th className="w-[9%] px-3 py-3 font-medium">Rating</th>
              <th className="w-[13%] px-3 py-3 font-medium">Phone</th>
              <th className="w-[25%] px-3 py-3 font-medium">Website</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-zinc-500">
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-zinc-500">
                  No available businesses match these filters.
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr
                  key={row.id}
                  className={`border-t border-zinc-100 dark:border-zinc-800 ${
                    conflictIds.has(row.id)
                      ? "bg-red-50 dark:bg-red-950/20"
                      : ""
                  }`}
                >
                  <td className="px-3 py-3 align-top">
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggleRow(row.id)}
                      aria-label={`Select ${row.title}`}
                    />
                  </td>
                  <td className="px-3 py-3 align-top">
                    <div className="truncate font-medium text-zinc-900 dark:text-zinc-50">
                      {row.title}
                    </div>
                    {row.address ? (
                      <div
                        className="mt-0.5 truncate text-xs text-zinc-500"
                        title={row.address}
                      >
                        {row.address}
                      </div>
                    ) : null}
                    {conflictIds.has(row.id) ? (
                      <div className="mt-0.5 text-xs text-red-600 dark:text-red-400">
                        Already claimed by another campaign
                      </div>
                    ) : null}
                  </td>
                  <td className="truncate px-3 py-3 align-top text-zinc-700 dark:text-zinc-300">
                    {row.industry}
                  </td>
                  <td className="truncate px-3 py-3 align-top text-zinc-700 dark:text-zinc-300">
                    {row.location}
                  </td>
                  <td className="truncate px-3 py-3 align-top text-zinc-700 dark:text-zinc-300">
                    {row.rating != null ? (
                      <>
                        {row.rating.toFixed(1)}★
                        {row.reviews != null ? (
                          <span className="text-xs text-zinc-500"> ({row.reviews})</span>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="truncate px-3 py-3 align-top text-zinc-700 dark:text-zinc-300">
                    {row.phone ?? "—"}
                  </td>
                  <td className="truncate px-3 py-3 align-top text-zinc-700 dark:text-zinc-300">
                    {row.website ? (
                      row.website.replace(/^https?:\/\//, "")
                    ) : (
                      <span className="text-zinc-400">No website</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && total > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Page {page + 1} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
              className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={(page + 1) * PAGE_SIZE >= total || loading}
              className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
