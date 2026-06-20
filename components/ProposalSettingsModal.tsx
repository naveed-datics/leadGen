"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  buildProposalTemplate,
  DEFAULT_PROPOSAL_TEMPLATE,
  PROPOSAL_PLACEHOLDERS,
  SAMPLE_PROPOSAL_PREVIEW,
} from "@/lib/proposal-template";

type WordPressPage = {
  id: number;
  title: string;
  link: string;
  status: string;
};

interface ProposalSettingsModalProps {
  open: boolean;
  searchId: string | null;
  searchQuery?: string;
  onClose: () => void;
  onSaved?: () => void;
}

export function ProposalSettingsModal({
  open,
  searchId,
  searchQuery,
  onClose,
  onSaved,
}: ProposalSettingsModalProps) {
  const [template, setTemplate] = useState(DEFAULT_PROPOSAL_TEMPLATE);
  const [fallbackTemplate, setFallbackTemplate] = useState(DEFAULT_PROPOSAL_TEMPLATE);
  const [previewIndustry, setPreviewIndustry] = useState(
    SAMPLE_PROPOSAL_PREVIEW.industry,
  );
  const [previewLocation, setPreviewLocation] = useState(
    SAMPLE_PROPOSAL_PREVIEW.location,
  );
  const [senderName, setSenderName] = useState(SAMPLE_PROPOSAL_PREVIEW.senderName);
  const [hasCustomTemplate, setHasCustomTemplate] = useState(false);
  const [demoEnabled, setDemoEnabled] = useState(false);
  const [defaultDemoPageId, setDefaultDemoPageId] = useState<number | null>(null);
  const [wpConfigured, setWpConfigured] = useState(false);
  const [pages, setPages] = useState<WordPressPage[]>([]);
  const [pagesLoading, setPagesLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const loadPages = useCallback(async () => {
    setPagesLoading(true);
    try {
      const res = await fetch("/api/agent/settings/demo/pages", {
        cache: "no-store",
      });
      const data = (await res.json()) as {
        pages?: WordPressPage[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to load pages");
      setPages(data.pages ?? []);
    } catch (e) {
      setPages([]);
      setError(e instanceof Error ? e.message : "Failed to load WordPress pages");
    } finally {
      setPagesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !searchId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setShowPreview(false);

    Promise.all([
      fetch(`/api/searches/${searchId}/settings/proposal-template`, {
        cache: "no-store",
      }),
      fetch("/api/auth/me", { cache: "no-store" }),
    ])
      .then(async ([settingsRes, meRes]) => {
        const settingsData = (await settingsRes.json()) as {
          template?: string | null;
          agentTemplate?: string | null;
          defaultTemplate?: string;
          effectiveTemplate?: string;
          industry?: string;
          location?: string;
          demoEnabled?: boolean;
          defaultDemoPageId?: number | null;
          effectiveDemoPageId?: number | null;
          wpConfigured?: boolean;
          error?: string;
        };
        const meData = (await meRes.json()) as {
          user?: { name: string };
          error?: string;
        };

        if (cancelled) return;
        if (!settingsRes.ok) {
          throw new Error(settingsData.error ?? "Failed to load settings");
        }

        const defaultTpl =
          settingsData.defaultTemplate ?? DEFAULT_PROPOSAL_TEMPLATE;
        const effective =
          settingsData.effectiveTemplate ??
          settingsData.template ??
          settingsData.agentTemplate ??
          defaultTpl;

        setFallbackTemplate(defaultTpl);
        setHasCustomTemplate(Boolean(settingsData.template?.trim()));
        setTemplate(settingsData.template?.trim() || effective);
        setPreviewIndustry(settingsData.industry ?? SAMPLE_PROPOSAL_PREVIEW.industry);
        setPreviewLocation(settingsData.location ?? SAMPLE_PROPOSAL_PREVIEW.location);
        setDemoEnabled(Boolean(settingsData.demoEnabled));
        setDefaultDemoPageId(
          settingsData.defaultDemoPageId ??
            settingsData.effectiveDemoPageId ??
            null,
        );
        setWpConfigured(Boolean(settingsData.wpConfigured));

        if (meRes.ok && meData.user?.name) {
          setSenderName(meData.user.name);
        }

        if (settingsData.wpConfigured) {
          void loadPages();
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load settings");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, searchId, loadPages]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (demoEnabled && wpConfigured && pages.length === 0 && !pagesLoading) {
      void loadPages();
    }
  }, [demoEnabled, wpConfigured, pages.length, pagesLoading, loadPages]);

  const previewText = buildProposalTemplate({
    businessName: SAMPLE_PROPOSAL_PREVIEW.businessName,
    industry: previewIndustry,
    location: previewLocation,
    senderName,
    demoUrl: demoEnabled ? SAMPLE_PROPOSAL_PREVIEW.demoUrl : "",
    customTemplate: template,
  });

  async function handleSave() {
    if (!searchId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/searches/${searchId}/settings/proposal-template`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            template,
            demoEnabled,
            defaultDemoPageId: demoEnabled ? defaultDemoPageId : null,
          }),
        },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setHasCustomTemplate(true);
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!searchId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/searches/${searchId}/settings/proposal-template`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ template: null }),
        },
      );
      const data = (await res.json()) as {
        effectiveTemplate?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to reset");
      setHasCustomTemplate(false);
      setTemplate(data.effectiveTemplate ?? fallbackTemplate);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reset");
    } finally {
      setSaving(false);
    }
  }

  if (!open || !searchId) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="proposal-settings-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-label="Close"
      />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <h2
            id="proposal-settings-title"
            className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
          >
            Search settings
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            {searchQuery
              ? `Settings for “${searchQuery}”.`
              : "Customize proposal and demo settings for this search."}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <p className="text-sm text-zinc-500">Loading…</p>
          ) : (
            <>
              <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={demoEnabled}
                    onChange={(e) => setDemoEnabled(e.target.checked)}
                    className="rounded border-zinc-300"
                  />
                  <span className="text-sm font-medium">Active website</span>
                </label>
                <p className="mt-2 text-xs text-zinc-500">
                  When enabled, proposals for this search can include a cloned
                  WordPress demo site URL via {"{{demoUrl}}"}.
                </p>

                {demoEnabled && !wpConfigured && (
                  <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
                    Connect WordPress in{" "}
                    <Link
                      href="/agent/settings"
                      className="font-medium underline"
                      onClick={onClose}
                    >
                      Agent Settings
                    </Link>{" "}
                    first.
                  </p>
                )}

                {demoEnabled && wpConfigured && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Landing page template
                      </h3>
                      <button
                        type="button"
                        onClick={() => void loadPages()}
                        disabled={pagesLoading}
                        className="text-xs font-medium text-emerald-600 hover:text-emerald-700 disabled:opacity-60"
                      >
                        {pagesLoading ? "Refreshing…" : "Refresh"}
                      </button>
                    </div>

                    {pagesLoading && pages.length === 0 ? (
                      <p className="mt-2 text-xs text-zinc-500">Loading pages…</p>
                    ) : pages.length === 0 ? (
                      <p className="mt-2 text-xs text-zinc-500">
                        No WordPress pages found.
                      </p>
                    ) : (
                      <ul className="mt-2 max-h-36 space-y-2 overflow-y-auto rounded-lg border border-zinc-200 p-2 dark:border-zinc-700">
                        {pages.map((page) => (
                          <li key={page.id} className="flex items-start gap-2 text-sm">
                            <input
                              type="radio"
                              name="searchDemoPage"
                              checked={defaultDemoPageId === page.id}
                              onChange={() => setDefaultDemoPageId(page.id)}
                              className="mt-1"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-zinc-900 dark:text-zinc-100">
                                {page.title}
                              </p>
                              <p className="text-xs text-zinc-500">
                                {page.status} ·{" "}
                                <a
                                  href={page.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-emerald-600 hover:underline"
                                >
                                  Preview
                                </a>
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </section>

              <label className="mt-4 block">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Proposal template
                </span>
                <textarea
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  rows={12}
                  className="mt-1 w-full resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </label>

              <p className="mt-2 text-xs text-zinc-500">
                Placeholders: {PROPOSAL_PLACEHOLDERS.join(", ")}
              </p>

              {!hasCustomTemplate && (
                <p className="mt-1 text-xs text-zinc-500">
                  Using your account default until you save a custom template for
                  this search.
                </p>
              )}

              {showPreview && (
                <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-950">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Preview
                  </p>
                  <pre className="mt-2 whitespace-pre-wrap text-sm text-zinc-800 dark:text-zinc-200">
                    {previewText}
                  </pre>
                </div>
              )}

              {error && (
                <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300"
          >
            Close
          </button>
          <button
            type="button"
            disabled={loading || saving}
            onClick={() => setShowPreview((v) => !v)}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-300"
          >
            {showPreview ? "Hide preview" : "Preview"}
          </button>
          <button
            type="button"
            disabled={loading || saving}
            onClick={() => void handleReset()}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-300"
          >
            Reset template
          </button>
          <button
            type="button"
            disabled={
              loading ||
              saving ||
              !template.trim() ||
              (demoEnabled && wpConfigured && !defaultDemoPageId)
            }
            onClick={() => void handleSave()}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
