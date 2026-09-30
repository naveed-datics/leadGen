"use client";

import { useCallback, useEffect, useState } from "react";
import {
  buildProposalTemplate,
  DEFAULT_PROPOSAL_TEMPLATE,
  PROPOSAL_PLACEHOLDERS,
  SAMPLE_PROPOSAL_PREVIEW,
} from "@/lib/proposal-template";
import type { CompetitorWithStats } from "@/lib/types";

type TemplateResponse = {
  template?: string | null;
  defaultTemplate?: string;
  error?: string;
};

const SAMPLE_COMPETITORS: CompetitorWithStats[] = [
  {
    id: "sample-1",
    title: "Sample Competitor One",
    website: "https://example-competitor-one.com/",
    address: null,
    stats: {
      trafficLabel: null,
      trafficEstimate: "51,537 visits/mo",
      websiteAge: null,
      lastUpdated: "Aug 2026",
      source: "measured",
    },
  },
  {
    id: "sample-2",
    title: "Sample Competitor Two",
    website: "https://example-competitor-two.com/",
    address: null,
    stats: {
      trafficLabel: null,
      trafficEstimate: "12,300 visits/mo",
      websiteAge: null,
      lastUpdated: "Jul 2026",
      source: "measured",
    },
  },
];

export function ProposalTemplateCard() {
  const [template, setTemplate] = useState(DEFAULT_PROPOSAL_TEMPLATE);
  const [defaultTemplate, setDefaultTemplate] = useState(
    DEFAULT_PROPOSAL_TEMPLATE,
  );
  const [isCustom, setIsCustom] = useState(false);
  const [senderName, setSenderName] = useState(SAMPLE_PROPOSAL_PREVIEW.senderName);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [templateRes, meRes] = await Promise.all([
        fetch("/api/agent/settings/proposal-template", { cache: "no-store" }),
        fetch("/api/auth/me", { cache: "no-store" }),
      ]);
      const data = (await templateRes.json()) as TemplateResponse;
      if (!templateRes.ok) {
        throw new Error(data.error ?? "Failed to load sales pitch template");
      }
      const meData = (await meRes.json()) as { user?: { name: string } };

      const fallback = data.defaultTemplate ?? DEFAULT_PROPOSAL_TEMPLATE;
      setDefaultTemplate(fallback);
      setIsCustom(Boolean(data.template?.trim()));
      setTemplate(data.template?.trim() || fallback);
      if (meRes.ok && meData.user?.name) setSenderName(meData.user.name);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to load sales pitch template",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(nextTemplate: string | null) {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/agent/settings/proposal-template", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: nextTemplate }),
      });
      const data = (await res.json()) as TemplateResponse;
      if (!res.ok) throw new Error(data.error ?? "Failed to save template");

      const saved = data.template?.trim() || null;
      setIsCustom(Boolean(saved));
      setTemplate(saved ?? defaultTemplate);
      setSuccess(saved ? "Sales pitch template saved." : "Reset to default.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save template");
    } finally {
      setSaving(false);
    }
  }

  const previewText = buildProposalTemplate({
    businessName: SAMPLE_PROPOSAL_PREVIEW.businessName,
    industry: SAMPLE_PROPOSAL_PREVIEW.industry,
    location: SAMPLE_PROPOSAL_PREVIEW.location,
    senderName,
    demoUrl: SAMPLE_PROPOSAL_PREVIEW.demoUrl,
    competitors: SAMPLE_COMPETITORS,
    customTemplate: template,
  });

  if (loading) {
    return (
      <section className="mt-6 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <p className="text-sm text-zinc-500">Loading sales pitch template…</p>
      </section>
    );
  }

  return (
    <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-base font-semibold">Sales pitch template</h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        The default message used for every new proposal. A search can override
        it from that search&apos;s own settings.
      </p>

      <label className="mt-3 block">
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Template
        </span>
        <textarea
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          rows={12}
          className="mt-2 w-full resize-y rounded-xl border border-zinc-300 bg-white px-3.5 py-3 font-mono text-sm text-zinc-950 shadow-sm outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
        />
      </label>

      <p className="mt-2 text-xs text-zinc-500">
        Placeholders: {PROPOSAL_PLACEHOLDERS.join(", ")}
      </p>
      <p className="mt-1 text-xs text-zinc-500">
        {isCustom
          ? "Using your custom template."
          : "Using the built-in default until you save a custom template."}
      </p>

      {showPreview && (
        <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-950">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Preview (sample data)
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
      {success && (
        <p role="status" className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">
          {success}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving || !template.trim()}
          onClick={() => void save(template)}
          className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 active:scale-[0.98] disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save template"}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => setShowPreview((v) => !v)}
          className="rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          {showPreview ? "Hide preview" : "Preview"}
        </button>
        <button
          type="button"
          disabled={saving || !isCustom}
          onClick={() => void save(null)}
          className="rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Reset to default
        </button>
      </div>
    </section>
  );
}
