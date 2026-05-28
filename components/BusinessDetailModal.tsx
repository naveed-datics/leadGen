"use client";

import { useEffect, useState, type ReactNode } from "react";
import { PhoneCell } from "@/components/PhoneCell";
import type { CompetitorsResponse, WebsiteStats } from "@/lib/types";

interface BusinessDetailModalProps {
  open: boolean;
  leadId: string | null;
  onClose: () => void;
}

export function BusinessDetailModal({
  open,
  leadId,
  onClose,
}: BusinessDetailModalProps) {
  const [data, setData] = useState<CompetitorsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !leadId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    fetch(`/api/leads/${leadId}/competitors?includeStats=true&refreshStats=true`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error ?? "Failed to load details");
        }
        if (!cancelled) setData(json as CompetitorsResponse);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load details");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, leadId]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setData(null);
        setError(null);
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const lead = data?.lead;

  function handleClose() {
    setData(null);
    setError(null);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="business-detail-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
        aria-label="Close"
      />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="overflow-y-auto p-6">
          <h2
            id="business-detail-title"
            className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
          >
            Business details
          </h2>

          {loading && (
            <p className="mt-6 text-sm text-zinc-500">Loading details…</p>
          )}

          {error && (
            <p className="mt-6 text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          {!loading && !error && lead && data && (
            <>
              <div className="mt-4 flex gap-4">
                <BusinessLogo thumbnail={lead.thumbnail} title={lead.title} />
                <div className="min-w-0 flex-1">
                  <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                    {lead.title}
                  </p>
                  {lead.type && (
                    <p className="mt-0.5 text-sm text-zinc-500">{lead.type}</p>
                  )}
                </div>
              </div>

              <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                <DetailRow label="Address" value={lead.address ?? "—"} />
                <DetailRow
                  label="Phone"
                  value={
                    lead.phone ? (
                      <PhoneCell
                        phone={lead.phone}
                        hasWhatsapp={lead.hasWhatsapp}
                      />
                    ) : (
                      "—"
                    )
                  }
                />
                <DetailRow
                  label="Rating"
                  value={formatRating(lead.rating, lead.reviews)}
                />
                <DetailRow
                  label="Maps"
                  value={
                    lead.mapsUrl ? (
                      <a
                        href={lead.mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                      >
                        Open in Google Maps
                      </a>
                    ) : (
                      "—"
                    )
                  }
                />
              </dl>

              <section className="mt-8">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                  Nearby competitors (with website)
                </h3>
                {data.pickSource === "ai" && (
                  <p className="mt-1 text-xs text-zinc-500">
                    Ranked by AI from businesses saved during this search.
                  </p>
                )}
                {data.pickSource === "cache" && (
                  <p className="mt-1 text-xs text-zinc-500">
                    Using cached competitor ranking.
                  </p>
                )}
                {data.trafficNote && (
                  <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
                    {data.trafficNote}{" "}
                    <a
                      href="https://apify.com/ecomdate/similarweb-scraper"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium underline"
                    >
                      Apify SimilarWeb scraper
                    </a>
                  </p>
                )}

                {data.competitorsMessage && data.competitors.length === 0 && (
                  <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                    {data.competitorsMessage}
                  </p>
                )}

                {data.competitors.length > 0 && (
                  <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
                    <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-700">
                      <thead className="bg-zinc-50 dark:bg-zinc-950/50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-zinc-500">
                            Business
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-zinc-500">
                            Website
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-zinc-500">
                            Traffic
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-zinc-500">
                            Last update
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        {data.competitors.map((competitor) => (
                          <tr key={competitor.id}>
                            <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                              {competitor.title}
                            </td>
                            <td className="px-3 py-2">
                              <a
                                href={competitor.website}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-emerald-600 hover:underline dark:text-emerald-400"
                              >
                                {shortUrl(competitor.website)}
                              </a>
                            </td>
                            <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                              <TrafficCell stats={competitor.stats} />
                            </td>
                            <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                              <StatsCell
                                primary={competitor.stats.lastUpdated}
                                source={competitor.stats.source}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        <div className="border-t border-zinc-200 px-6 py-4 dark:border-zinc-700">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function BusinessLogo({
  thumbnail,
  title,
}: {
  thumbnail: string | null;
  title: string;
}) {
  if (thumbnail) {
    return (
      <img
        src={thumbnail}
        alt=""
        className="h-16 w-16 shrink-0 rounded-xl border border-zinc-200 object-cover dark:border-zinc-700"
      />
    );
  }
  const initial = title.trim().charAt(0).toUpperCase() || "?";
  return (
    <div
      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-100 text-xl font-semibold text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
      aria-hidden
    >
      {initial}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </dt>
      <dd className="mt-0.5 text-zinc-800 dark:text-zinc-200">{value}</dd>
    </div>
  );
}

function TrafficCell({ stats }: { stats: WebsiteStats }) {
  if (
    stats.trafficError &&
    !stats.trafficError.includes("Rent the Apify actor")
  ) {
    return (
      <span className="text-xs text-amber-700 dark:text-amber-300">
        {stats.trafficError}
      </span>
    );
  }

  const isApify = stats.source === "apify";
  const primary = isApify
    ? (stats.trafficEstimate ?? stats.trafficLabel)
    : (stats.trafficLabel ?? stats.trafficEstimate);
  const secondary = isApify
    ? stats.trafficLabel && stats.trafficEstimate
      ? `Rank ${stats.trafficLabel}`
      : null
    : stats.trafficLabel && stats.trafficEstimate
      ? stats.trafficEstimate
      : null;

  return (
    <StatsCell
      primary={primary}
      secondary={secondary}
      source={stats.source}
    />
  );
}

function StatsCell({
  primary,
  secondary,
  source,
}: {
  primary: string | null;
  secondary?: string | null;
  source: string;
}) {
  if (!primary) return <span>—</span>;
  return (
    <span className="inline-flex flex-col gap-0.5">
      <span>
        {primary}
        {source === "apify" && (
          <span className="ml-1.5 inline-block rounded bg-sky-100 px-1 py-0.5 text-[10px] font-medium uppercase text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">
            Apify
          </span>
        )}
        {(source === "ai" || source === "mixed") && (
          <span className="ml-1.5 inline-block rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium uppercase text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
            AI
          </span>
        )}
      </span>
      {secondary && (
        <span className="text-xs text-zinc-500">{secondary}</span>
      )}
    </span>
  );
}

function formatRating(rating: number | null, reviews: number | null): string {
  if (rating == null) return "—";
  const reviewPart = reviews != null ? ` (${reviews} reviews)` : "";
  return `${rating}★${reviewPart}`;
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname === "/" ? "" : u.pathname;
    const full = host + path;
    return full.length > 28 ? `${full.slice(0, 25)}…` : full;
  } catch {
    return url;
  }
}
