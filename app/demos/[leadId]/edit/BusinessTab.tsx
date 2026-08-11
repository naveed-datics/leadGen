"use client";

import { useState } from "react";

export type ThemeSettings = {
  bodyTextColor?: string;
  headingColor?: string;
  linkColor?: string;
  buttonBgColor?: string;
  buttonTextColor?: string;
  headerBgColor?: string;
  headerTextColor?: string;
  headerLinkColor?: string;
  footerBgColor?: string;
  footerTextColor?: string;
  footerLinkColor?: string;
  logoAsText?: boolean;
};

export type PageFieldMap = {
  source_page_id: number;
  slug?: string;
  fields?: Record<string, string>;
  content_document_edits?: { path: string; value: string }[];
};

export type DemoGenLead = {
  id: string;
  businessName: string;
  slug: string;
  industry: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  tagline: string | null;
  notes: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  themeJson: string | null;
  status: string;
  wpSiteId: number | null;
  wpSiteUrl: string | null;
  pageMap: string | null;
  templateSiteId: number | null;
};

type Props = {
  leadId: string;
  lead: DemoGenLead;
  onSaved: (lead: DemoGenLead) => void;
};

export function BusinessTab({ leadId, lead, onSaved }: Props) {
  const [businessName, setBusinessName] = useState(lead.businessName);
  const [industry, setIndustry] = useState(lead.industry ?? "");
  const [phone, setPhone] = useState(lead.phone ?? "");
  const [email, setEmail] = useState(lead.email ?? "");
  const [address, setAddress] = useState(lead.address ?? "");
  const [tagline, setTagline] = useState(lead.tagline ?? "");
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/demo-proxy`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName, industry, phone, email, address, tagline, notes }),
      });
      const data = (await res.json()) as {
        lead?: DemoGenLead;
        brandingApplied?: boolean;
        error?: string;
        message?: string;
      };
      if (!res.ok) throw new Error(data.error ?? data.message ?? "Failed to save");
      if (data.lead) onSaved(data.lead);
      setMessage(data.brandingApplied ? "Saved and re-applied to the live site." : "Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Business name" value={businessName} onChange={setBusinessName} required />
        <Field label="Industry" value={industry} onChange={setIndustry} />
        <Field label="Phone" value={phone} onChange={setPhone} />
        <Field label="Email" value={email} onChange={setEmail} type="email" />
        <Field label="Address" value={address} onChange={setAddress} className="sm:col-span-2" />
        <Field label="Tagline" value={tagline} onChange={setTagline} className="sm:col-span-2" />
      </div>
      <label className="block">
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
        />
      </label>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {message && <p className="text-sm text-emerald-700 dark:text-emerald-300">{message}</p>}

      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save business info"}
      </button>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
      />
    </label>
  );
}
