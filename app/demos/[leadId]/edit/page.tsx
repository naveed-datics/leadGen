"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BusinessTab, type DemoGenLead } from "./BusinessTab";
import { BrandingTab } from "./BrandingTab";
import { PagesTab } from "./PagesTab";

type Tab = "business" | "branding" | "pages";

const TABS: { id: Tab; label: string }[] = [
  { id: "business", label: "Business" },
  { id: "branding", label: "Branding" },
  { id: "pages", label: "Pages" },
];

export default function EditDemoPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const { leadId } = use(params);
  const [activeTab, setActiveTab] = useState<Tab>("business");
  const [lead, setLead] = useState<DemoGenLead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/demo-proxy`, { cache: "no-store" });
      const data = (await res.json()) as { lead?: DemoGenLead; error?: string; message?: string };
      if (!res.ok) throw new Error(data.error ?? data.message ?? "Failed to load demo");
      if (!data.lead) throw new Error("Demo builder returned no lead data");
      setLead(data.lead);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load demo");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <Link
        href="/demos"
        className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        ← Back to demos
      </Link>

      <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Edit demo
      </h1>
      {lead && (
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {lead.businessName}
          {lead.wpSiteUrl && (
            <>
              {" — "}
              <a
                href={lead.wpSiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                view live site
              </a>
            </>
          )}
        </p>
      )}

      {loading ? (
        <p role="status" className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          Loading…
        </p>
      ) : error ? (
        <div
          role="alert"
          className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
        </div>
      ) : lead ? (
        <>
          <div role="tablist" aria-label="Edit demo sections" className="mt-6 flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
                  activeTab === tab.id
                    ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                    : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mt-6">
            {activeTab === "business" && (
              <BusinessTab leadId={leadId} lead={lead} onSaved={setLead} />
            )}
            {activeTab === "branding" && (
              <BrandingTab leadId={leadId} lead={lead} onSaved={setLead} />
            )}
            {activeTab === "pages" && <PagesTab leadId={leadId} lead={lead} />}
          </div>
        </>
      ) : null}
    </main>
  );
}
