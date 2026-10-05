"use client";

import { useEffect, useState } from "react";

type Template = { id: number; title: string; slug: string; url: string };

export function CampaignSettingsModal({
  campaignId,
  currentTemplate,
  onClose,
  onSaved,
}: {
  campaignId: string;
  currentTemplate: string | null;
  onClose: () => void;
  onSaved: (demoTemplate: string | null) => void;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(currentTemplate ?? "");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/campaigns/${campaignId}/templates`, { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json()) as { templates?: Template[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Failed to load templates");
        if (cancelled) return;
        const list = data.templates ?? [];
        setTemplates(list);
        // Normalise an older slug-based save to the site id.
        const saved = list.find(
          (t) =>
            currentTemplate &&
            (String(t.id) === currentTemplate ||
              (t.slug !== "" && t.slug === currentTemplate)),
        );
        if (saved) setSelected(String(saved.id));
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load templates");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId, currentTemplate]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demoTemplate: selected }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save settings");
      onSaved(selected);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  // Saved value is a site id; older saves may hold a slug.
  const matchesSaved = (t: Template, value: string) =>
    String(t.id) === value || (t.slug !== "" && t.slug === value);
  const missingSaved =
    !loading &&
    currentTemplate &&
    !templates.some((t) => matchesSaved(t, currentTemplate));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="campaign-settings-title"
        className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2
          id="campaign-settings-title"
          className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
        >
          Campaign settings
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Choose the template site cloned for every demo in this campaign.
        </p>

        <label className="mt-4 block">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Demo template
          </span>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={loading}
            className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm dark:bg-zinc-950"
          >
            <option value="" disabled>
              {loading ? "Loading templates…" : "Select a template"}
            </option>
            {missingSaved && (
              <option value={currentTemplate}>{currentTemplate} (not found)</option>
            )}
            {templates.map((t) => (
              <option key={t.id} value={String(t.id)}>
                {t.title || t.url}
              </option>
            ))}
          </select>
        </label>

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !selected}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
