"use client";

import Link from "next/link";

export type IndustryOption = {
  id: string;
  name: string;
};

interface SearchFormProps {
  industryId: string;
  industryOptions?: IndustryOption[];
  industryLockedToOptions?: boolean;
  industriesManageHref?: string;
  location: string;
  locationOptions?: string[];
  locationLabel?: string;
  locationPlaceholder?: string;
  locationLockedToOptions?: boolean;
  disabled?: boolean;
  loading: boolean;
  onIndustryChange: (industryId: string) => void;
  onLocationChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function SearchForm({
  industryId,
  industryOptions,
  industryLockedToOptions,
  industriesManageHref = "/agent/industries",
  location,
  locationOptions,
  locationLabel,
  locationPlaceholder,
  locationLockedToOptions,
  disabled,
  loading,
  onIndustryChange,
  onLocationChange,
  onSubmit,
}: SearchFormProps) {
  const lockLocation = Boolean(locationLockedToOptions);
  const hasLocationOptions = Boolean(locationOptions && locationOptions.length > 0);
  const lockIndustry = Boolean(industryLockedToOptions);
  const hasIndustryOptions = Boolean(industryOptions && industryOptions.length > 0);
  const formDisabled = Boolean(disabled) || loading;
  const locationDisabled = formDisabled || (lockLocation && !hasLocationOptions);
  const industryDisabled = formDisabled || (lockIndustry && !hasIndustryOptions);
  const submitDisabled =
    formDisabled ||
    (lockLocation && !hasLocationOptions) ||
    (lockIndustry && !hasIndustryOptions);

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      {lockIndustry && !hasIndustryOptions && (
        <div
          role="status"
          className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"
        >
          Add at least one industry in{" "}
          <Link href={industriesManageHref} className="font-medium underline">
            Industries
          </Link>{" "}
          before searching.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Industry
          </span>
          {hasIndustryOptions ? (
            <select
              value={industryId}
              onChange={(e) => onIndustryChange(e.target.value)}
              disabled={industryDisabled}
              required
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            >
              {(industryOptions ?? []).map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.name}
                </option>
              ))}
            </select>
          ) : lockIndustry ? (
            <select
              value=""
              disabled={industryDisabled}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            >
              <option value="">No industries configured</option>
            </select>
          ) : (
            <input
              type="text"
              value={industryId}
              onChange={(e) => onIndustryChange(e.target.value)}
              placeholder="e.g. plumbers, coffee shops"
              disabled={formDisabled}
              required
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          )}
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {locationLabel ?? "Location"}
          </span>
          {hasLocationOptions ? (
            <select
              value={location}
              onChange={(e) => onLocationChange(e.target.value)}
              disabled={locationDisabled}
              required
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            >
              {(locationOptions ?? []).map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : lockLocation ? (
            <select
              value=""
              disabled={locationDisabled}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            >
              <option value="">No cities configured for this region</option>
            </select>
          ) : (
            <input
              type="text"
              value={location}
              onChange={(e) => onLocationChange(e.target.value)}
              placeholder={locationPlaceholder ?? "Search city"}
              disabled={locationDisabled}
              required
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          )}
        </label>
      </div>
      <button
        type="submit"
        disabled={submitDisabled}
        className="mt-5 w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-[140px]"
      >
        {loading ? "Searching…" : "Find leads"}
      </button>
    </form>
  );
}
