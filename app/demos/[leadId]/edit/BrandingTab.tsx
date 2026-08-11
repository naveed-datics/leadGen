"use client";

import { useState } from "react";
import type { DemoGenLead, ThemeSettings } from "./BusinessTab";

type Props = {
  leadId: string;
  lead: DemoGenLead;
  onSaved: (lead: DemoGenLead) => void;
};

function parseTheme(themeJson: string | null): ThemeSettings {
  if (!themeJson) return {};
  try {
    const parsed = JSON.parse(themeJson);
    return parsed && typeof parsed === "object" ? (parsed as ThemeSettings) : {};
  } catch {
    return {};
  }
}

export function BrandingTab({ leadId, lead, onSaved }: Props) {
  const [primaryColor, setPrimaryColor] = useState(lead.primaryColor ?? "#1e3a5f");
  const [secondaryColor, setSecondaryColor] = useState(lead.secondaryColor ?? "#2563eb");
  const [accentColor, setAccentColor] = useState(lead.accentColor ?? "#f59e0b");
  const [logoUrl, setLogoUrl] = useState(lead.logoUrl ?? "");
  const theme = parseTheme(lead.themeJson);
  const [logoAsText, setLogoAsText] = useState(Boolean(theme.logoAsText));
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function uploadLogo(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/leads/${leadId}/demo-proxy/uploads/logo`, {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as { url?: string; error?: string; message?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? data.message ?? "Logo upload failed");
      setLogoUrl(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Logo upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function saveAndApply(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setApplying(false);
    setError(null);
    setMessage(null);
    try {
      const patchRes = await fetch(`/api/leads/${leadId}/demo-proxy`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryColor,
          secondaryColor,
          accentColor,
          logoUrl,
          theme: { ...theme, logoAsText },
        }),
      });
      const patchData = (await patchRes.json()) as {
        lead?: DemoGenLead;
        error?: string;
        message?: string;
      };
      if (!patchRes.ok) throw new Error(patchData.error ?? patchData.message ?? "Failed to save branding");
      if (patchData.lead) onSaved(patchData.lead);

      if (lead.wpSiteId) {
        setApplying(true);
        const applyRes = await fetch(`/api/leads/${leadId}/demo-proxy/apply-branding`, {
          method: "POST",
        });
        const applyData = (await applyRes.json()) as { error?: string; message?: string };
        if (!applyRes.ok) throw new Error(applyData.error ?? applyData.message ?? "Failed to apply branding");
        setMessage("Branding saved and applied to the live site.");
      } else {
        setMessage("Branding saved.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save branding");
    } finally {
      setSaving(false);
      setApplying(false);
    }
  }

  return (
    <form onSubmit={saveAndApply} className="space-y-6">
      <section>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Logo</h3>
        <div className="mt-3 flex items-center gap-4">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Logo" className="h-12 w-auto rounded border border-zinc-200 bg-white p-1" />
          ) : (
            <span className="text-sm text-zinc-400">No logo uploaded yet.</span>
          )}
          <label className="cursor-pointer rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800">
            {uploading ? "Uploading…" : "Choose file"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])}
            />
          </label>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={logoAsText}
            onChange={(e) => setLogoAsText(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300"
          />
          Use business name as a text logo (hide the image)
        </label>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Brand colors</h3>
        <div className="mt-3 flex flex-wrap gap-4">
          <ColorField label="Primary" value={primaryColor} onChange={setPrimaryColor} />
          <ColorField label="Secondary" value={secondaryColor} onChange={setSecondaryColor} />
          <ColorField label="Accent" value={accentColor} onChange={setAccentColor} />
        </div>
      </section>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {message && <p className="text-sm text-emerald-700 dark:text-emerald-300">{message}</p>}

      <button
        type="submit"
        disabled={saving || uploading}
        className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
      >
        {applying ? "Applying to live site…" : saving ? "Saving…" : "Save & apply branding"}
      </button>
    </form>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded border border-zinc-300"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-28 rounded-md border px-2 py-1.5 text-sm"
        />
      </div>
    </label>
  );
}
