"use client";

import { useState } from "react";
import type { DemoGenLead, PageFieldMap } from "./BusinessTab";

type Props = {
  leadId: string;
  lead: DemoGenLead;
};

function parsePageMap(pageMapJson: string | null): PageFieldMap[] {
  if (!pageMapJson) return [];
  try {
    const parsed = JSON.parse(pageMapJson);
    return Array.isArray(parsed) ? (parsed as PageFieldMap[]) : [];
  } catch {
    return [];
  }
}

/** One editable content_document_edits array as newline-delimited "path = value" text. */
function editsToText(edits: PageFieldMap["content_document_edits"]): string {
  return (edits ?? []).map((e) => `${e.path} = ${e.value}`).join("\n");
}

function textToEdits(text: string): { path: string; value: string }[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf("=");
      if (idx === -1) return null;
      return { path: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
    })
    .filter((e): e is { path: string; value: string } => e !== null);
}

export function PagesTab({ leadId, lead }: Props) {
  const [pageMap, setPageMap] = useState<PageFieldMap[]>(parsePageMap(lead.pageMap));
  const [editText, setEditText] = useState<Record<number, string>>(() =>
    Object.fromEntries(pageMap.map((p) => [p.source_page_id, editsToText(p.content_document_edits)])),
  );
  const [generating, setGenerating] = useState<number | "all" | null>(null);
  const [applying, setApplying] = useState<number | null>(null);
  const [applyingAll, setApplyingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function generateText(pageIds?: number[]) {
    const res = await fetch(`/api/leads/${leadId}/demo-proxy/generate-text`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateSiteId: lead.templateSiteId,
        businessName: lead.businessName,
        industry: lead.industry ?? undefined,
        phone: lead.phone ?? undefined,
        email: lead.email ?? undefined,
        address: lead.address ?? undefined,
        pageMap,
        pageIds,
      }),
    });
    const data = (await res.json()) as { pageMap?: PageFieldMap[]; error?: string; message?: string };
    if (!res.ok || !data.pageMap) throw new Error(data.error ?? data.message ?? "Generation failed");
    return data.pageMap;
  }

  /** Persists generated content to the lead record so it survives a page
   * refresh even before the operator applies it to the live site — apply-page
   * does this too on success, but generation alone doesn't touch the DB. */
  async function persistPageMap(newPageMap: PageFieldMap[]) {
    await fetch(`/api/leads/${leadId}/demo-proxy`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageMap: newPageMap }),
    }).catch(() => {
      // Best-effort — the generated content still lives in local state and
      // can be applied this session even if the background save fails.
    });
  }

  /** Bootstraps the page list for demos that never had a pageMap generated
   * (e.g. provisioned before AI content was run) — generates content for
   * every page on the template site, not just ones already listed here. */
  async function generateAllPages() {
    setGenerating("all");
    setError(null);
    setMessage(null);
    try {
      const newPageMap = await generateText(undefined);
      setPageMap(newPageMap);
      setEditText(
        Object.fromEntries(newPageMap.map((p) => [p.source_page_id, editsToText(p.content_document_edits)])),
      );
      await persistPageMap(newPageMap);
      setMessage(`Generated content for ${newPageMap.length} page(s).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(null);
    }
  }

  async function generatePage(page: PageFieldMap) {
    setGenerating(page.source_page_id);
    setError(null);
    setMessage(null);
    try {
      const newPageMap = await generateText([page.source_page_id]);
      setPageMap(newPageMap);
      const updated = newPageMap.find((p) => p.source_page_id === page.source_page_id);
      if (updated) {
        setEditText((prev) => ({
          ...prev,
          [page.source_page_id]: editsToText(updated.content_document_edits),
        }));
      }
      await persistPageMap(newPageMap);
      setMessage(`Generated content for "${page.slug ?? page.source_page_id}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(null);
    }
  }

  async function applyPage(page: PageFieldMap) {
    setApplying(page.source_page_id);
    setError(null);
    setMessage(null);
    try {
      const edits = textToEdits(editText[page.source_page_id] ?? "");
      const res = await fetch(`/api/leads/${leadId}/demo-proxy/apply-page`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourcePageId: page.source_page_id,
          slug: page.slug,
          content_document_edits: edits,
        }),
      });
      const data = (await res.json()) as { applied?: boolean; error?: string; message?: string };
      if (!res.ok) throw new Error(data.error ?? data.message ?? "Failed to apply page");
      setMessage(`Applied "${page.slug ?? page.source_page_id}" to the live site.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply page");
    } finally {
      setApplying(null);
    }
  }

  async function applyAll() {
    setApplyingAll(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/demo-proxy/apply-content`, { method: "POST" });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(data.error ?? data.message ?? "Failed to apply all pages");
      setMessage("Applied all pages to the live site.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply all pages");
    } finally {
      setApplyingAll(false);
    }
  }

  if (pageMap.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          This demo doesn&apos;t have page content generated yet. Generate content for every
          page on the site to start editing text and images.
        </p>
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={() => void generateAllPages()}
          disabled={generating === "all" || !lead.templateSiteId}
          className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
        >
          {generating === "all" ? "Generating…" : "Generate all page content"}
        </button>
        {!lead.templateSiteId && (
          <p className="text-xs text-zinc-500 dark:text-zinc-500">
            This demo has no template site on record, so content can&apos;t be generated.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {message && <p className="text-sm text-emerald-700 dark:text-emerald-300">{message}</p>}

      <button
        type="button"
        onClick={() => void applyAll()}
        disabled={applyingAll}
        className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        {applyingAll ? "Applying all pages…" : "Apply all pages to live site"}
      </button>

      {pageMap.map((page) => (
        <section
          key={page.source_page_id}
          className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
        >
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {page.slug ?? `Page ${page.source_page_id}`}
          </h3>
          <label className="mt-3 block">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Content (one field per line: path = value)
            </span>
            <textarea
              value={editText[page.source_page_id] ?? ""}
              onChange={(e) =>
                setEditText((prev) => ({ ...prev, [page.source_page_id]: e.target.value }))
              }
              rows={6}
              className="mt-1 w-full rounded-md border px-3 py-2 font-mono text-xs"
            />
          </label>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void generatePage(page)}
              disabled={generating === page.source_page_id}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {generating === page.source_page_id ? "Generating…" : "Generate with AI"}
            </button>
            <button
              type="button"
              onClick={() => void applyPage(page)}
              disabled={applying === page.source_page_id}
              className="rounded-md bg-black px-3 py-1.5 text-sm text-white disabled:opacity-60"
            >
              {applying === page.source_page_id ? "Applying…" : "Apply to live site"}
            </button>
          </div>
        </section>
      ))}
    </div>
  );
}
