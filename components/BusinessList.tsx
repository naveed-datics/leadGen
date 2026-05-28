"use client";

import type { BusinessLead, SearchResult } from "@/lib/types";

interface BusinessListProps {
  result: SearchResult | null;
  searched: boolean;
}

export function BusinessList({ result, searched }: BusinessListProps) {
  if (!searched) return null;

  if (!result) return null;

  if (result.businesses.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-6 py-10 text-center dark:border-zinc-800 dark:bg-zinc-900/50">
        <p className="text-lg font-medium text-zinc-800 dark:text-zinc-200">
          No leads found
        </p>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Scanned {result.totalFetched} businesses for &ldquo;{result.query}
          &rdquo; — none were missing a website. Try a different industry or
          location.
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100">
        <strong>{result.totalWithoutWebsite}</strong> leads without a website
        (from {result.totalFetched} businesses scanned across{" "}
        {result.pagesFetched} page{result.pagesFetched === 1 ? "" : "s"})
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="hidden overflow-x-auto sm:block">
          <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
            <thead className="bg-zinc-50 dark:bg-zinc-950/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Business
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 sm:table-cell">
                  Category
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 md:table-cell">
                  Address
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 lg:table-cell">
                  Phone
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Rating
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Maps
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {result.businesses.map((business) => (
                <BusinessRow key={rowKey(business)} business={business} />
              ))}
            </tbody>
          </table>
        </div>

        <ul className="divide-y divide-zinc-100 sm:hidden dark:divide-zinc-800">
          {result.businesses.map((business) => (
            <BusinessCard key={rowKey(business)} business={business} />
          ))}
        </ul>
      </div>
    </section>
  );
}

function rowKey(business: BusinessLead): string {
  return business.placeId ?? business.title;
}

function BusinessRow({ business }: { business: BusinessLead }) {
  return (
    <tr className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30">
      <td className="px-4 py-3">
        <p className="font-medium text-zinc-900 dark:text-zinc-100">
          {business.title}
        </p>
      </td>
      <td className="hidden px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400 sm:table-cell">
        {business.type ?? "—"}
      </td>
      <td className="hidden max-w-xs px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400 md:table-cell">
        {business.address ?? "—"}
      </td>
      <td className="hidden px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400 lg:table-cell">
        {business.phone ? (
          <a href={`tel:${business.phone}`} className="hover:text-emerald-600">
            {business.phone}
          </a>
        ) : (
          "—"
        )}
      </td>
      <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
        {formatRating(business)}
      </td>
      <td className="px-4 py-3 text-right">
        {business.mapsUrl ? (
          <a
            href={business.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
          >
            Open
          </a>
        ) : (
          "—"
        )}
      </td>
    </tr>
  );
}

function BusinessCard({ business }: { business: BusinessLead }) {
  return (
    <li className="space-y-2 px-4 py-4">
      <p className="font-medium text-zinc-900 dark:text-zinc-100">
        {business.title}
      </p>
      {business.type && (
        <p className="text-sm text-zinc-500">{business.type}</p>
      )}
      {business.address && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {business.address}
        </p>
      )}
      {business.phone && (
        <a
          href={`tel:${business.phone}`}
          className="block text-sm text-emerald-600"
        >
          {business.phone}
        </a>
      )}
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {formatRating(business)}
      </p>
      {business.mapsUrl && (
        <a
          href={business.mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-sm font-medium text-emerald-600"
        >
          View on Maps
        </a>
      )}
    </li>
  );
}

function formatRating(business: BusinessLead): string {
  if (business.rating == null) return "—";
  const reviews =
    business.reviews != null ? ` (${business.reviews} reviews)` : "";
  return `${business.rating}★${reviews}`;
}
