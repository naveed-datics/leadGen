"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActionIcon } from "@/components/ActionIcon";

type BusinessRow = {
  id: string;
  title: string;
  industry: string;
  location: string;
  socials: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  hasWebsite: boolean;
  hasWhatsapp: boolean | null;
  websiteCheckState: string | null;
  websiteHttpStatus: number | null;
  websiteCheckedAt: string | null;
  copyrightText: string | null;
  copyrightYear: number | null;
  contactsFound: number | null;
  contactsStatus: string | null;
  contactsVerifiedAt: string | null;
  address: string | null;
  rating: number | null;
  reviews: number | null;
  mapsUrl: string | null;
  searchId: string;
  createdAt: string;
  campaignName: string | null;
};

type WhatsappFilter = "any" | "true" | "false" | "unchecked";
type SocialsFilter = "any" | "true" | "false";
type CampaignFilter = "any" | "none";
type RatingFilter = "any" | "4.5" | "4" | "3.5" | "3";

type CampaignOption = {
  id: string;
  name: string;
};

type WebsiteStateFilter =
  | "any"
  | "ok"
  | "down"
  | "blocked"
  | "error"
  | "unchecked"
  | "copyright_2023"
  | "copyright_2022"
  | "copyright_2021"
  | "copyright_2020";

const COPYRIGHT_MAX_YEAR: Partial<Record<WebsiteStateFilter, number>> = {
  copyright_2023: 2023,
  copyright_2022: 2022,
  copyright_2021: 2021,
  copyright_2020: 2020,
};

const PAGE_SIZE = 50;

type ListResponse =
  | { items: BusinessRow[]; total: number; limit: number; offset: number }
  | { error: string };

type EditForm = {
  title: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  socials: string;
};

type CheckNoWebsiteResponse = {
  complete: boolean;
  resumeAfter?: string;
  checked: number;
  remainingEstimate?: number;
  results?: Record<string, boolean>;
  error?: string;
};

type FindSocialsResponse = {
  complete: boolean;
  resumeAfter?: string;
  checked: number;
  moved: number;
  remainingEstimate?: number;
  error?: string;
};

type VerifyNoWebsiteResponse = {
  complete: boolean;
  resumeAfter?: string;
  checked: number;
  socialsUpdated: number;
  websitesUpdated: number;
  errors?: number;
  remainingEstimate?: number;
  error?: string;
};

type BusinessReview = {
  author: string | null;
  rating: number | null;
  text: string | null;
  source: string | null;
};

type BusinessContact = {
  id: string;
  source: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  reviewsJson: BusinessReview[] | null;
  photoUrls: string[] | null;
  matchConfidence: string | null;
  matchNotes: string | null;
  tavilyRawJson: unknown;
};

type VerifyContactsResponse = {
  cached?: boolean;
  found: number;
  websiteUpdated?: boolean;
  socialsUpdated?: boolean;
  enrichment?: {
    facebook?: { url: string | null };
    instagram?: { url: string | null };
    website?: { url: string | null };
  };
  contacts: BusinessContact[];
  error?: string;
};

type ContactsResponse = {
  contacts: BusinessContact[];
  error?: string;
};

type CheckWebsitesResponse = {
  complete: boolean;
  resumeAfter?: string;
  checked: number;
  down?: number;
  blocked?: number;
  scraped?: number;
  remainingEstimate?: number;
  error?: string;
};

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

function WhatsappIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path d="M12.004 2c-5.514 0-9.997 4.483-9.997 9.997 0 1.763.464 3.482 1.345 4.997L2 22l5.146-1.35a9.96 9.96 0 0 0 4.858 1.238h.004c5.513 0 9.996-4.483 9.996-9.997C21.996 6.483 17.518 2 12.004 2zm0 18.176a8.16 8.16 0 0 1-4.166-1.14l-.299-.177-3.055.801.816-2.978-.194-.306a8.146 8.146 0 0 1-1.257-4.383c0-4.508 3.669-8.176 8.163-8.176 4.494 0 8.163 3.668 8.163 8.176 0 4.508-3.669 8.183-8.171 8.183z" />
    </svg>
  );
}

function CallIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function readWhatsappParam(value: string | null): WhatsappFilter {
  return value === "true" || value === "false" || value === "unchecked"
    ? value
    : "any";
}

export default function BusinessesPage() {
  const [industry, setIndustry] = useState("");
  const [hasWebsite, setHasWebsite] = useState<"any" | "true" | "false">("any");
  const [website, setWebsite] = useState("");
  const [phone, setPhone] = useState("");
  const [hasWhatsapp, setHasWhatsapp] = useState<WhatsappFilter>("any");
  const [hasSocials, setHasSocials] = useState<SocialsFilter>("any");
  const [websiteStateFilter, setWebsiteStateFilter] =
    useState<WebsiteStateFilter>("any");
  const [location, setLocation] = useState("");
  const [industries, setIndustries] = useState<string[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [campaignFilter, setCampaignFilter] = useState<CampaignFilter>("any");
  const [campaignOptions, setCampaignOptions] = useState<CampaignOption[]>([]);
  const [minRating, setMinRating] = useState<RatingFilter>("any");

  const [applied, setApplied] = useState({
    industry: "",
    hasWebsite: "any" as "any" | "true" | "false",
    website: "",
    phone: "",
    hasWhatsapp: "any" as WhatsappFilter,
    hasSocials: "any" as SocialsFilter,
    websiteState: "any" as WebsiteStateFilter,
    location: "",
    campaignId: "",
    campaignFilter: "any" as CampaignFilter,
    minRating: "any" as RatingFilter,
  });

  // Seed the WhatsApp filter from the URL (e.g. deep-linked from the dashboard)
  // after mount only, so the server-rendered and first client render match —
  // reading it during render via useSearchParams() requires a Suspense
  // boundary and causes a hydration mismatch on this fully client-fetched page.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = readWhatsappParam(params.get("hasWhatsapp"));
    if (fromUrl === "any") return;
    setHasWhatsapp(fromUrl);
    setApplied((prev) => ({ ...prev, hasWhatsapp: fromUrl }));
  }, []);

  const [items, setItems] = useState<BusinessRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const [checkingWhatsapp, setCheckingWhatsapp] = useState(false);
  const [whatsappCheckedTotal, setWhatsappCheckedTotal] = useState(0);
  const [whatsappStatus, setWhatsappStatus] = useState<string | null>(null);

  const [findingSocials, setFindingSocials] = useState(false);
  const [socialsCheckedTotal, setSocialsCheckedTotal] = useState(0);
  const [socialsMovedTotal, setSocialsMovedTotal] = useState(0);
  const [socialsStatus, setSocialsStatus] = useState<string | null>(null);

  const [checkingWebsites, setCheckingWebsites] = useState(false);
  const [websiteCheckedTotal, setWebsiteCheckedTotal] = useState(0);
  const [websiteDownTotal, setWebsiteDownTotal] = useState(0);
  const [websiteStatus, setWebsiteStatus] = useState<string | null>(null);

  const [verifyingNoWebsite, setVerifyingNoWebsite] = useState(false);
  const [verifyNoWebsiteCheckedTotal, setVerifyNoWebsiteCheckedTotal] =
    useState(0);
  const [verifyNoWebsiteSocialsTotal, setVerifyNoWebsiteSocialsTotal] =
    useState(0);
  const [verifyNoWebsiteWebsitesTotal, setVerifyNoWebsiteWebsitesTotal] =
    useState(0);
  const [verifyNoWebsiteStatus, setVerifyNoWebsiteStatus] = useState<
    string | null
  >(null);

  const [editing, setEditing] = useState<BusinessRow | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    title: "",
    phone: "",
    email: "",
    website: "",
    address: "",
    socials: "",
  });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BusinessRow | null>(null);

  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [contactsModal, setContactsModal] = useState<BusinessRow | null>(null);
  const [contactsByBusiness, setContactsByBusiness] = useState<
    Record<string, BusinessContact[]>
  >({});
  const [loadingContactsId, setLoadingContactsId] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (applied.industry.trim()) params.set("industry", applied.industry.trim());
    if (applied.hasWebsite !== "any") params.set("hasWebsite", applied.hasWebsite);
    if (applied.website.trim()) params.set("website", applied.website.trim());
    if (applied.phone.trim()) params.set("phone", applied.phone.trim());
    if (applied.hasWhatsapp !== "any") params.set("hasWhatsapp", applied.hasWhatsapp);
    if (applied.hasSocials !== "any") params.set("hasSocials", applied.hasSocials);
    if (applied.websiteState !== "any") {
      const copyrightMaxYear = COPYRIGHT_MAX_YEAR[applied.websiteState];
      if (copyrightMaxYear != null) {
        params.set("copyrightMaxYear", String(copyrightMaxYear));
      } else {
        params.set("websiteState", applied.websiteState);
      }
    }
    if (applied.location.trim()) params.set("location", applied.location.trim());
    if (applied.campaignId) params.set("campaign", applied.campaignId);
    else if (applied.campaignFilter !== "any") {
      params.set("campaignFilter", applied.campaignFilter);
    }
    if (applied.minRating !== "any") params.set("minRating", applied.minRating);
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(page * PAGE_SIZE));
    return params.toString();
  }, [applied, page]);

  const hasActiveFilters =
    applied.industry.trim() !== "" ||
    applied.hasWebsite !== "any" ||
    applied.website.trim() !== "" ||
    applied.phone.trim() !== "" ||
    applied.hasWhatsapp !== "any" ||
    applied.hasSocials !== "any" ||
    applied.websiteState !== "any" ||
    applied.location.trim() !== "" ||
    applied.campaignId !== "" ||
    applied.campaignFilter !== "any" ||
    applied.minRating !== "any";

  useEffect(() => {
    let cancelled = false;
    async function loadIndustries() {
      try {
        const res = await fetch("/api/businesses/industries", {
          cache: "no-store",
        });
        const data = (await res.json()) as {
          industries?: string[];
          error?: string;
        };
        if (cancelled || !res.ok || !Array.isArray(data.industries)) return;
        setIndustries(data.industries);
      } catch {
        // ignore — dropdown stays empty / All only
      }
    }
    void loadIndustries();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadCampaigns() {
      try {
        const res = await fetch("/api/campaigns?status=draft,active", {
          cache: "no-store",
        });
        const data = (await res.json()) as {
          campaigns?: CampaignOption[];
          error?: string;
        };
        if (cancelled || !res.ok || !Array.isArray(data.campaigns)) return;
        setCampaignOptions(data.campaigns);
      } catch {
        // ignore — dropdown stays empty / Any only
      }
    }
    void loadCampaigns();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/businesses?${queryString}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as ListResponse;
      if (!res.ok || "error" in data) {
        setError("error" in data ? data.error : "Failed to load businesses");
        setItems([]);
        setTotal(0);
        return;
      }
      setItems(data.items);
      setTotal(data.total);
    } catch {
      setError("Network error");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    void load();
  }, [load]);

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    setPage(0);
    setApplied({
      industry,
      hasWebsite,
      website,
      phone,
      hasWhatsapp,
      hasSocials,
      websiteState: websiteStateFilter,
      location,
      campaignId,
      campaignFilter,
      minRating,
    });
  }

  function clearFilters() {
    setIndustry("");
    setHasWebsite("any");
    setWebsite("");
    setPhone("");
    setHasWhatsapp("any");
    setHasSocials("any");
    setWebsiteStateFilter("any");
    setLocation("");
    setCampaignId("");
    setCampaignFilter("any");
    setMinRating("any");
    setPage(0);
    setApplied({
      industry: "",
      hasWebsite: "any",
      website: "",
      phone: "",
      hasWhatsapp: "any",
      hasSocials: "any",
      websiteState: "any",
      location: "",
      campaignId: "",
      campaignFilter: "any",
      minRating: "any",
    });
  }

  function websiteBadge(
    state: string | null,
    httpStatus: number | null,
  ): { label: string; className: string } | null {
    const base =
      "mt-1 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide";
    switch (state) {
      case "down":
        return {
          label: httpStatus ? `Down · ${httpStatus}` : "Down",
          className: `${base} bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300`,
        };
      case "blocked":
        return {
          label: httpStatus ? `Blocked · ${httpStatus}` : "Blocked",
          className: `${base} bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300`,
        };
      case "error":
        return {
          label: "Error",
          className: `${base} bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300`,
        };
      case "ok":
        return {
          label: "OK",
          className: `${base} bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300`,
        };
      default:
        return null;
    }
  }

  function openEdit(row: BusinessRow) {
    setEditing(row);
    setEditForm({
      title: row.title,
      phone: row.phone ?? "",
      email: row.email ?? "",
      website: row.website ?? "",
      address: row.address ?? "",
      socials: row.socials ?? "",
    });
    setError(null);
  }

  function closeEdit() {
    if (saving) return;
    setEditing(null);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    if (!editForm.title.trim()) {
      setError("Title is required");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/businesses/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editForm.title.trim(),
          phone: editForm.phone.trim() || null,
          email: editForm.email.trim() || null,
          website: editForm.website.trim() || null,
          address: editForm.address.trim() || null,
          socials: editForm.socials.trim() || null,
        }),
      });
      const data = (await res.json()) as {
        business?: {
          id: string;
          title: string;
          phone: string | null;
          email: string | null;
          website: string | null;
          hasWebsite: boolean;
          address: string | null;
          socials: string | null;
        };
        error?: string;
      };
      if (!res.ok || !data.business) {
        setError(data.error ?? "Failed to update business");
        return;
      }

      const nextAddress = data.business.address;
      const nextSocials = data.business.socials ?? null;
      const patched = {
        title: data.business.title,
        phone: data.business.phone,
        email: data.business.email,
        website: data.business.website,
        hasWebsite: data.business.hasWebsite,
        address: nextAddress,
        socials: nextSocials,
      };
      setItems((prev) =>
        prev.map((item) =>
          item.id === editing.id ? { ...item, ...patched } : item,
        ),
      );
      setContactsModal((prev) =>
        prev?.id === editing.id ? { ...prev, ...patched } : prev,
      );
      setEditing(null);
    } catch {
      setError("Network error while saving");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    setError(null);
    try {
      const res = await fetch(`/api/businesses/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!res.ok) {
        setError(data?.error ?? "Failed to delete business");
        return;
      }
      setItems((prev) => prev.filter((item) => item.id !== deleteTarget.id));
      setTotal((prev) => Math.max(0, prev - 1));
      setDeleteTarget(null);
    } catch {
      setError("Network error while deleting");
    } finally {
      setDeletingId(null);
    }
  }

  async function verifyContacts(row: BusinessRow) {
    setVerifyingId(row.id);
    setError(null);
    try {
      const res = await fetch(`/api/businesses/${row.id}/verify-contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => null)) as
        | VerifyContactsResponse
        | { error?: string }
        | null;
      if (!res.ok || !data || "error" in data) {
        setError(
          (data && "error" in data && data.error) || "Contact lookup failed",
        );
        setItems((prev) =>
          prev.map((item) =>
            item.id === row.id
              ? {
                  ...item,
                  contactsStatus: "error",
                  contactsVerifiedAt: new Date().toISOString(),
                }
              : item,
          ),
        );
        return;
      }

      const result = data as VerifyContactsResponse;
      const facebookUrl = result.contacts
        .map((c) => c.facebookUrl)
        .find((u) => Boolean(u));
      const instagramUrl = result.contacts
        .map((c) => c.instagramUrl)
        .find((u) => Boolean(u));
      const socialUrls = [facebookUrl, instagramUrl].filter(
        (u): u is string => Boolean(u),
      );
      const websiteFromEnrich =
        result.enrichment?.website?.url?.trim() || null;

      const nextRow: BusinessRow = {
        ...row,
        contactsFound: result.found,
        contactsStatus: result.found > 0 ? "ok" : "none",
        contactsVerifiedAt: new Date().toISOString(),
        ...(websiteFromEnrich
          ? { website: websiteFromEnrich, hasWebsite: true }
          : {}),
        ...(socialUrls.length > 0
          ? {
              socials: [
                ...new Set(
                  [...(row.socials?.split(",") ?? []), ...socialUrls]
                    .map((s) => s.trim())
                    .filter(Boolean),
                ),
              ].join(","),
            }
          : {}),
      };
      setContactsByBusiness((prev) => ({
        ...prev,
        [row.id]: result.contacts,
      }));
      setItems((prev) =>
        prev.map((item) => (item.id === row.id ? nextRow : item)),
      );
      setContactsModal(nextRow);
    } catch {
      setError("Network error while verifying contacts");
    } finally {
      setVerifyingId(null);
    }
  }

  async function openContacts(row: BusinessRow) {
    setContactsModal(row);
    if (contactsByBusiness[row.id]) return;

    setLoadingContactsId(row.id);
    try {
      const res = await fetch(`/api/businesses/${row.id}/contacts`, {
        cache: "no-store",
      });
      const data = (await res.json().catch(() => null)) as ContactsResponse | null;
      if (res.ok && data && Array.isArray(data.contacts)) {
        setContactsByBusiness((prev) => ({ ...prev, [row.id]: data.contacts }));
      }
    } catch {
      // leave the modal empty; the Verify button can retry
    } finally {
      setLoadingContactsId(null);
    }
  }

  async function exportCsv() {
    setExporting(true);
    setError(null);
    try {
      const params = new URLSearchParams(queryString);
      params.set("format", "csv");
      params.delete("limit");
      const res = await fetch(`/api/businesses?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Export failed");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `businesses-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Network error while exporting");
    } finally {
      setExporting(false);
    }
  }

  async function findSocials() {
    setFindingSocials(true);
    setError(null);
    setSocialsCheckedTotal(0);
    setSocialsMovedTotal(0);
    setSocialsStatus("Scanning websites for Instagram/Facebook…");
    setWhatsappStatus(null);
    setVerifyNoWebsiteStatus(null);

    let resumeAfter: string | undefined;
    let totalChecked = 0;
    let totalMoved = 0;

    try {
      for (;;) {
        const res = await fetch("/api/businesses/find-socials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(resumeAfter ? { resumeAfter } : {}),
        });
        const data = (await res.json()) as FindSocialsResponse;
        if (!res.ok) {
          setError(data.error ?? "Find Socials failed");
          setSocialsStatus(null);
          return;
        }

        totalChecked += data.checked ?? 0;
        totalMoved += data.moved ?? 0;
        setSocialsCheckedTotal(totalChecked);
        setSocialsMovedTotal(totalMoved);

        const remaining = data.remainingEstimate ?? 0;
        if (data.complete) {
          setSocialsStatus(
            totalMoved === 0
              ? "No Instagram/Facebook URLs found in website fields."
              : `Done. Moved ${totalMoved} social URL${totalMoved === 1 ? "" : "s"} (scanned ${totalChecked}).`,
          );
          await load();
          return;
        }

        setSocialsStatus(
          `Scanned ${totalChecked}… moved ${totalMoved}… ${remaining} remaining`,
        );
        resumeAfter = data.resumeAfter;
        if (!resumeAfter) {
          setError("Find Socials paused without a resume point. Try again.");
          setSocialsStatus(null);
          return;
        }
      }
    } catch {
      setError("Network error while finding socials");
      setSocialsStatus(null);
    } finally {
      setFindingSocials(false);
    }
  }

  async function verifyNoWebsiteSocials() {
    setVerifyingNoWebsite(true);
    setError(null);
    setVerifyNoWebsiteCheckedTotal(0);
    setVerifyNoWebsiteSocialsTotal(0);
    setVerifyNoWebsiteWebsitesTotal(0);
    setVerifyNoWebsiteStatus(
      "Verifying Facebook/Instagram/website for businesses without a website…",
    );
    setSocialsStatus(null);
    setWhatsappStatus(null);
    setWebsiteStatus(null);

    let resumeAfter: string | undefined;
    let totalChecked = 0;
    let totalSocials = 0;
    let totalWebsites = 0;
    let totalErrors = 0;

    try {
      for (;;) {
        const res = await fetch("/api/businesses/verify-no-website", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(resumeAfter ? { resumeAfter } : {}),
        });
        const data = (await res.json()) as VerifyNoWebsiteResponse;
        if (!res.ok) {
          setError(data.error ?? "Verify Socials failed");
          setVerifyNoWebsiteStatus(null);
          return;
        }

        totalChecked += data.checked ?? 0;
        totalSocials += data.socialsUpdated ?? 0;
        totalWebsites += data.websitesUpdated ?? 0;
        totalErrors += data.errors ?? 0;
        setVerifyNoWebsiteCheckedTotal(totalChecked);
        setVerifyNoWebsiteSocialsTotal(totalSocials);
        setVerifyNoWebsiteWebsitesTotal(totalWebsites);

        const remaining = data.remainingEstimate ?? 0;
        if (data.complete) {
          setVerifyNoWebsiteStatus(
            totalChecked === 0
              ? "No unverified businesses without a website."
              : `Done. Checked ${totalChecked} — ${totalSocials} with socials, ${totalWebsites} websites found${totalErrors > 0 ? `, ${totalErrors} errors` : ""}.`,
          );
          await load();
          return;
        }

        setVerifyNoWebsiteStatus(
          `Checked ${totalChecked}… socials ${totalSocials}… websites ${totalWebsites}… ${remaining} remaining`,
        );
        resumeAfter = data.resumeAfter;
        if (!resumeAfter) {
          setError("Verify paused without a resume point. Try again.");
          setVerifyNoWebsiteStatus(null);
          return;
        }
      }
    } catch {
      setError("Network error while verifying socials");
      setVerifyNoWebsiteStatus(null);
    } finally {
      setVerifyingNoWebsite(false);
    }
  }

  async function checkWebsites() {
    setCheckingWebsites(true);
    setError(null);
    setWebsiteCheckedTotal(0);
    setWebsiteDownTotal(0);
    setWebsiteStatus("Checking websites…");
    setSocialsStatus(null);
    setWhatsappStatus(null);
    setVerifyNoWebsiteStatus(null);

    let resumeAfter: string | undefined;
    let totalChecked = 0;
    let totalDown = 0;

    try {
      for (;;) {
        const res = await fetch("/api/businesses/check-websites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(resumeAfter ? { resumeAfter } : {}),
        });
        const data = (await res.json()) as CheckWebsitesResponse;
        if (!res.ok) {
          setError(data.error ?? "Website check failed");
          setWebsiteStatus(null);
          return;
        }

        totalChecked += data.checked ?? 0;
        totalDown += data.down ?? 0;
        setWebsiteCheckedTotal(totalChecked);
        setWebsiteDownTotal(totalDown);

        const remaining = data.remainingEstimate ?? 0;
        if (data.complete) {
          setWebsiteStatus(
            totalChecked === 0
              ? "No unchecked businesses with a website."
              : `Done. Checked ${totalChecked} — ${totalDown} down.`,
          );
          await load();
          return;
        }

        setWebsiteStatus(
          `Checked ${totalChecked}… ${totalDown} down… ${remaining} remaining`,
        );
        resumeAfter = data.resumeAfter;
        if (!resumeAfter) {
          setError("Website check paused without a resume point. Try again.");
          setWebsiteStatus(null);
          return;
        }
      }
    } catch {
      setError("Network error while checking websites");
      setWebsiteStatus(null);
    } finally {
      setCheckingWebsites(false);
    }
  }

  async function checkWhatsappNoWebsite() {
    setCheckingWhatsapp(true);
    setError(null);
    setWhatsappCheckedTotal(0);
    setWhatsappStatus("Starting WhatsApp check…");
    setSocialsStatus(null);
    setVerifyNoWebsiteStatus(null);

    let resumeAfter: string | undefined;
    let totalChecked = 0;

    try {
      for (;;) {
        const res = await fetch("/api/whatsapp/check-no-website", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(resumeAfter ? { resumeAfter } : {}),
        });
        const data = (await res.json()) as CheckNoWebsiteResponse;
        if (!res.ok) {
          setError(data.error ?? "WhatsApp check failed");
          setWhatsappStatus(null);
          return;
        }

        totalChecked += data.checked ?? 0;
        setWhatsappCheckedTotal(totalChecked);

        const remaining = data.remainingEstimate ?? 0;
        if (data.complete) {
          setWhatsappStatus(
            totalChecked === 0
              ? "No unchecked no-website leads with a phone number."
              : `Done. Checked ${totalChecked} lead${totalChecked === 1 ? "" : "s"}.`,
          );
          return;
        }

        setWhatsappStatus(
          `Checked ${totalChecked}… ${remaining} remaining`,
        );
        resumeAfter = data.resumeAfter;
        if (!resumeAfter) {
          setError("Check paused without a resume point. Try again.");
          setWhatsappStatus(null);
          return;
        }
      }
    } catch {
      setError("Network error while checking WhatsApp");
      setWhatsappStatus(null);
    } finally {
      setCheckingWhatsapp(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-[-0.035em] text-zinc-900 dark:text-zinc-50">
            Business
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            All businesses from your saved searches. Filter above, then export CSV.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void findSocials()}
            disabled={
              findingSocials ||
              checkingWhatsapp ||
              checkingWebsites ||
              verifyingNoWebsite ||
              loading
            }
            className="rounded-xl border border-emerald-700 px-4 py-2.5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50 disabled:opacity-60 dark:border-emerald-500 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
          >
            {findingSocials
              ? `Finding… (${socialsMovedTotal}/${socialsCheckedTotal})`
              : "Find Socials"}
          </button>
          <button
            type="button"
            onClick={() => void verifyNoWebsiteSocials()}
            disabled={
              verifyingNoWebsite ||
              findingSocials ||
              checkingWhatsapp ||
              checkingWebsites ||
              loading
            }
            className="rounded-xl border border-sky-700 px-4 py-2.5 text-sm font-semibold text-sky-800 transition hover:bg-sky-50 disabled:opacity-60 dark:border-sky-500 dark:text-sky-300 dark:hover:bg-sky-950/40"
            title="Run enrich verify for all businesses without a website"
          >
            {verifyingNoWebsite
              ? `Verifying… (${verifyNoWebsiteSocialsTotal} socials / ${verifyNoWebsiteCheckedTotal})`
              : "Find Social & Verify Data"}
          </button>
          <button
            type="button"
            onClick={() => void checkWebsites()}
            disabled={
              checkingWebsites ||
              findingSocials ||
              checkingWhatsapp ||
              verifyingNoWebsite ||
              loading
            }
            className="rounded-xl border border-emerald-700 px-4 py-2.5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50 disabled:opacity-60 dark:border-emerald-500 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
          >
            {checkingWebsites
              ? `Checking… (${websiteDownTotal} down / ${websiteCheckedTotal})`
              : "Check Websites"}
          </button>
          <button
            type="button"
            onClick={() => void checkWhatsappNoWebsite()}
            disabled={
              checkingWhatsapp ||
              findingSocials ||
              checkingWebsites ||
              verifyingNoWebsite ||
              loading
            }
            className="rounded-xl border border-emerald-700 px-4 py-2.5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50 disabled:opacity-60 dark:border-emerald-500 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
          >
            {checkingWhatsapp
              ? `Checking… (${whatsappCheckedTotal})`
              : "Check WhatsApp (no website)"}
          </button>
        </div>
      </header>

      {(whatsappStatus ||
        socialsStatus ||
        websiteStatus ||
        verifyNoWebsiteStatus) && (
        <div
          role="status"
          className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100"
        >
          {verifyNoWebsiteStatus ??
            websiteStatus ??
            socialsStatus ??
            whatsappStatus}
        </div>
      )}

      <form
        onSubmit={applyFilters}
        className="mt-7 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <label className="block">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Industry
            </span>
            <select
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className={`mt-1.5 ${inputClass}`}
            >
              <option value="">All industries</option>
              {industries.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Has website
            </span>
            <select
              value={hasWebsite}
              onChange={(e) =>
                setHasWebsite(e.target.value as "any" | "true" | "false")
              }
              className={`mt-1.5 ${inputClass}`}
            >
              <option value="any">Any</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Website contains
            </span>
            <input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className={`mt-1.5 ${inputClass}`}
              placeholder="example.com"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Phone contains
            </span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={`mt-1.5 ${inputClass}`}
              placeholder="555"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              WhatsApp
            </span>
            <select
              value={hasWhatsapp}
              onChange={(e) =>
                setHasWhatsapp(e.target.value as WhatsappFilter)
              }
              className={`mt-1.5 ${inputClass}`}
            >
              <option value="any">Any</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
              <option value="unchecked">Unchecked</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Have socials
            </span>
            <select
              value={hasSocials}
              onChange={(e) =>
                setHasSocials(e.target.value as SocialsFilter)
              }
              className={`mt-1.5 ${inputClass}`}
            >
              <option value="any">Any</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Website status
            </span>
            <select
              value={websiteStateFilter}
              onChange={(e) =>
                setWebsiteStateFilter(e.target.value as WebsiteStateFilter)
              }
              className={`mt-1.5 ${inputClass}`}
            >
              <option value="any">Any</option>
              <option value="ok">OK</option>
              <option value="down">Down</option>
              <option value="blocked">Blocked</option>
              <option value="error">Error</option>
              <option value="unchecked">Unchecked</option>
              <option value="copyright_2023">Copyright ≤ 2023</option>
              <option value="copyright_2022">Copyright ≤ 2022</option>
              <option value="copyright_2021">Copyright ≤ 2021</option>
              <option value="copyright_2020">Copyright ≤ 2020</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Location
            </span>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className={`mt-1.5 ${inputClass}`}
              placeholder="Zip code or city"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Campaign
            </span>
            <select
              value={campaignId ? `id:${campaignId}` : campaignFilter}
              onChange={(e) => {
                const value = e.target.value;
                if (value.startsWith("id:")) {
                  setCampaignId(value.slice(3));
                  setCampaignFilter("any");
                } else {
                  setCampaignId("");
                  setCampaignFilter(value as CampaignFilter);
                }
              }}
              className={`mt-1.5 ${inputClass}`}
            >
              <option value="any">Any</option>
              <option value="none">None</option>
              {campaignOptions.map((option) => (
                <option key={option.id} value={`id:${option.id}`}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Min rating
            </span>
            <select
              value={minRating}
              onChange={(e) => setMinRating(e.target.value as RatingFilter)}
              className={`mt-1.5 ${inputClass}`}
            >
              <option value="any">Any</option>
              <option value="4.5">4.5+</option>
              <option value="4">4+</option>
              <option value="3.5">3.5+</option>
              <option value="3">3+</option>
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="submit"
            className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Apply filters
          </button>
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
          >
            Clear
          </button>
        </div>
      </form>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {loading ? "Loading…" : `${total} business${total === 1 ? "" : "es"}`}
          {!loading && items.length < total
            ? ` (showing ${items.length})`
            : null}
        </p>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => void exportCsv()}
            disabled={
              exporting ||
              loading ||
              checkingWhatsapp ||
              findingSocials ||
              checkingWebsites
            }
            className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-60"
          >
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
        )}
      </div>

      <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/60">
            <tr>
              <th className="w-[17%] px-3 py-3 font-medium">Business</th>
              <th className="w-[9%] px-3 py-3 font-medium">Industry</th>
              <th className="w-[9%] px-3 py-3 font-medium">Location</th>
              <th className="w-[8%] px-3 py-3 font-medium">Rating</th>
              <th className="w-[12%] px-3 py-3 font-medium">Social media</th>
              <th className="w-[10%] px-3 py-3 font-medium">Phone</th>
              <th className="w-[23%] px-3 py-3 font-medium">Website</th>
              <th className="w-[12%] px-3 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-zinc-500">
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-zinc-500">
                  No businesses match these filters.
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr
                  key={row.id}
                  className="border-t border-zinc-100 dark:border-zinc-800"
                >
                  <td className="px-3 py-3 align-top">
                    <div className="truncate font-medium text-zinc-900 dark:text-zinc-50">
                      {row.mapsUrl ? (
                        <a
                          href={row.mapsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="underline-offset-2 hover:underline"
                          title={row.title}
                        >
                          {row.title}
                        </a>
                      ) : (
                        <span title={row.title}>{row.title}</span>
                      )}
                    </div>
                    {row.campaignName ? (
                      <span className="mt-0.5 inline-block rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                        {row.campaignName}
                      </span>
                    ) : null}
                    {row.address ? (
                      <div
                        className="mt-0.5 truncate text-xs text-zinc-500"
                        title={row.address}
                      >
                        {row.address}
                      </div>
                    ) : null}
                  </td>
                  <td
                    className="truncate px-3 py-3 align-top text-zinc-700 dark:text-zinc-300"
                    title={row.industry}
                  >
                    {row.industry}
                  </td>
                  <td
                    className="truncate px-3 py-3 align-top text-zinc-700 dark:text-zinc-300"
                    title={row.location}
                  >
                    {row.location}
                  </td>
                  <td className="truncate px-3 py-3 align-top text-zinc-700 dark:text-zinc-300">
                    {row.rating != null ? (
                      <>
                        {row.rating.toFixed(1)}★
                        {row.reviews != null ? (
                          <span className="text-xs text-zinc-500"> ({row.reviews})</span>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 align-top">
                    {row.socials ? (
                      <a
                        href={row.socials.split(",")[0]?.trim()}
                        target="_blank"
                        rel="noreferrer"
                        title={row.socials}
                        className="block truncate text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
                      >
                        {row.socials
                          .split(",")
                          .map((s) => s.trim().replace(/^https?:\/\//, ""))
                          .filter(Boolean)
                          .join(", ")}
                      </a>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <div className="flex items-center gap-1.5">
                      {row.phone ? (
                        row.hasWhatsapp ? (
                          <a
                            href={`https://wa.me/${row.phone.replace(/[^0-9]/g, "")}`}
                            target="_blank"
                            rel="noreferrer"
                            title="Message on WhatsApp"
                            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                          >
                            <WhatsappIcon className="h-4 w-4" />
                          </a>
                        ) : (
                          <a
                            href={`tel:${row.phone}`}
                            title="Call"
                            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-950/40"
                          >
                            <CallIcon className="h-4 w-4" />
                          </a>
                        )
                      ) : null}
                      <span
                        className="truncate text-zinc-700 dark:text-zinc-300"
                        title={row.phone ?? undefined}
                      >
                        {row.phone ?? "—"}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 align-top">
                    {row.website ? (
                      <>
                        <a
                          href={row.website}
                          target="_blank"
                          rel="noreferrer"
                          title={row.website}
                          className="block truncate text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
                        >
                          {row.website.replace(/^https?:\/\//, "")}
                        </a>
                        {(() => {
                          const badge = websiteBadge(
                            row.websiteCheckState,
                            row.websiteHttpStatus,
                          );
                          return badge ? (
                            <span className={badge.className}>{badge.label}</span>
                          ) : null;
                        })()}
                        {row.copyrightText ? (
                          <span
                            title={row.copyrightText}
                            className={`mt-1 block truncate text-[11px] ${
                              row.copyrightYear &&
                              row.copyrightYear <
                                new Date().getFullYear() - 1
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-zinc-500"
                            }`}
                          >
                            {row.copyrightText}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-zinc-400">No website</span>
                    )}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <div className="flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void openContacts(row)}
                        title="View detail"
                        aria-label="View detail"
                        className="rounded-lg border border-sky-300 p-1.5 text-sky-700 hover:bg-sky-50 dark:border-sky-800 dark:text-sky-300 dark:hover:bg-sky-950/40"
                      >
                        <ActionIcon variant="view" />
                      </button>
                      <Link
                        href={`/searches/${row.searchId}`}
                        title="Open search"
                        aria-label="Open search"
                        className="rounded-lg border border-emerald-300 p-1.5 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                      >
                        <ActionIcon variant="search" />
                      </Link>
                      {!row.contactsVerifiedAt && (
                        <button
                          type="button"
                          onClick={() => void verifyContacts(row)}
                          disabled={verifyingId === row.id}
                          title="Verify"
                          aria-label="Verify"
                          className="rounded-lg border border-indigo-300 p-1.5 text-indigo-700 hover:bg-indigo-50 disabled:opacity-60 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
                        >
                          <ActionIcon variant="verify" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        title="Edit"
                        aria-label="Edit"
                        className="rounded-lg border border-zinc-300 p-1.5 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        <ActionIcon variant="edit" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(row)}
                        disabled={deletingId === row.id}
                        title="Delete"
                        aria-label="Delete"
                        className="rounded-lg border border-red-200 p-1.5 text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40"
                      >
                        <ActionIcon variant="delete" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && total > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Page {page + 1} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
              className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={(page + 1) * PAGE_SIZE >= total || loading}
              className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-business-title"
        >
          <form
            onSubmit={(e) => void saveEdit(e)}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
          >
            <h2
              id="edit-business-title"
              className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
            >
              Edit business
            </h2>
            <div className="mt-4 grid gap-3">
              <label className="block">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Title
                </span>
                <input
                  required
                  value={editForm.title}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, title: e.target.value }))
                  }
                  className={`mt-1.5 ${inputClass}`}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Phone
                </span>
                <input
                  value={editForm.phone}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, phone: e.target.value }))
                  }
                  className={`mt-1.5 ${inputClass}`}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Email
                </span>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, email: e.target.value }))
                  }
                  className={`mt-1.5 ${inputClass}`}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Website
                </span>
                <input
                  value={editForm.website}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, website: e.target.value }))
                  }
                  className={`mt-1.5 ${inputClass}`}
                  placeholder="https://"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Address
                </span>
                <input
                  value={editForm.address}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, address: e.target.value }))
                  }
                  className={`mt-1.5 ${inputClass}`}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Socials
                </span>
                <textarea
                  value={editForm.socials}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, socials: e.target.value }))
                  }
                  rows={2}
                  placeholder="https://instagram.com/…, https://facebook.com/…"
                  className={`mt-1.5 ${inputClass}`}
                />
                <span className="mt-1 block text-xs text-zinc-500">
                  Comma-separated Instagram, Facebook, or other profile URLs.
                </span>
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeEdit}
                disabled={saving}
                className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-business-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <h2
              id="delete-business-title"
              className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
            >
              Delete business?
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              This removes <span className="font-medium">{deleteTarget.title}</span>{" "}
              from the directory. Linked outreach leads for this business are also
              removed.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deletingId === deleteTarget.id}
                className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={deletingId === deleteTarget.id}
                className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {deletingId === deleteTarget.id ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {contactsModal && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="contacts-modal-title"
        >
          <div className="my-8 w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  id="contacts-modal-title"
                  className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
                >
                  Business Detail · {contactsModal.title}
                </h2>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {contactsModal.address ?? contactsModal.location}
                  {contactsModal.contactsVerifiedAt
                    ? ` · verified ${new Date(
                        contactsModal.contactsVerifiedAt,
                      ).toLocaleString()}`
                    : null}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setContactsModal(null)}
                className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Close
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void verifyContacts(contactsModal)}
                disabled={verifyingId === contactsModal.id}
                className="rounded-lg border border-sky-300 px-2.5 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50 disabled:opacity-60 dark:border-sky-800 dark:text-sky-300 dark:hover:bg-sky-950/40"
              >
                {verifyingId === contactsModal.id
                  ? "Verifying…"
                  : contactsModal.contactsVerifiedAt
                    ? "Re-verify"
                    : "Verify"}
              </button>
              <span className="text-xs text-zinc-400">
                Source: find-facebook-page enrich (Facebook, Instagram,
                website). When found, socials and website fields are updated.
              </span>
              {contactsModal.contactsVerifiedAt && verifyingId !== contactsModal.id ? (
                contactsModal.contactsStatus === "error" ? (
                  <span className="text-xs text-red-500">
                    Last lookup failed — try re-verifying.
                  </span>
                ) : contactsModal.contactsStatus === "none" ? (
                  <span className="text-xs text-zinc-400">
                    No contacts found on last verify.
                  </span>
                ) : null
              ) : null}
            </div>

            <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-950/40">
              <p className="font-semibold text-zinc-700 dark:text-zinc-200">
                Business record
              </p>
              <dl className="mt-1.5 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
                <dt className="text-zinc-400">Industry</dt>
                <dd className="text-zinc-700 dark:text-zinc-300">
                  {contactsModal.industry}
                </dd>
                <dt className="text-zinc-400">Location</dt>
                <dd className="text-zinc-700 dark:text-zinc-300">
                  {contactsModal.location}
                </dd>
                {contactsModal.phone ? (
                  <>
                    <dt className="text-zinc-400">Phone</dt>
                    <dd className="text-zinc-700 dark:text-zinc-300">
                      {contactsModal.phone}
                      {contactsModal.hasWhatsapp ? " · WhatsApp" : ""}
                    </dd>
                  </>
                ) : null}
                {contactsModal.email ? (
                  <>
                    <dt className="text-zinc-400">Email</dt>
                    <dd>
                      <a
                        href={`mailto:${contactsModal.email}`}
                        className="text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
                      >
                        {contactsModal.email}
                      </a>
                    </dd>
                  </>
                ) : null}
                {contactsModal.website ? (
                  <>
                    <dt className="text-zinc-400">Website</dt>
                    <dd className="flex flex-wrap items-center gap-1.5">
                      <a
                        href={contactsModal.website}
                        target="_blank"
                        rel="noreferrer"
                        className="break-all text-sky-700 underline-offset-2 hover:underline dark:text-sky-300"
                      >
                        {contactsModal.website}
                      </a>
                      {(() => {
                        const badge = websiteBadge(
                          contactsModal.websiteCheckState,
                          contactsModal.websiteHttpStatus,
                        );
                        return badge ? (
                          <span className={badge.className}>{badge.label}</span>
                        ) : null;
                      })()}
                    </dd>
                  </>
                ) : null}
                {contactsModal.copyrightText ? (
                  <>
                    <dt className="text-zinc-400">Copyright</dt>
                    <dd className="text-zinc-700 dark:text-zinc-300">
                      {contactsModal.copyrightText}
                      {contactsModal.copyrightYear
                        ? ` (${contactsModal.copyrightYear})`
                        : ""}
                    </dd>
                  </>
                ) : null}
                {contactsModal.socials ? (
                  <>
                    <dt className="text-zinc-400">Social media</dt>
                    <dd className="break-all text-zinc-700 dark:text-zinc-300">
                      {contactsModal.socials}
                    </dd>
                  </>
                ) : null}
                {contactsModal.rating != null ? (
                  <>
                    <dt className="text-zinc-400">Rating</dt>
                    <dd className="text-zinc-700 dark:text-zinc-300">
                      {contactsModal.rating}
                      {contactsModal.reviews != null
                        ? ` (${contactsModal.reviews} reviews)`
                        : ""}
                    </dd>
                  </>
                ) : null}
                {contactsModal.mapsUrl ? (
                  <>
                    <dt className="text-zinc-400">Maps</dt>
                    <dd>
                      <a
                        href={contactsModal.mapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sky-700 underline-offset-2 hover:underline dark:text-sky-300"
                      >
                        Open in Google Maps
                      </a>
                    </dd>
                  </>
                ) : null}
                <dt className="text-zinc-400">Added</dt>
                <dd className="text-zinc-700 dark:text-zinc-300">
                  {new Date(contactsModal.createdAt).toLocaleString()}
                </dd>
              </dl>
            </div>

            <div className="mt-4">
              {loadingContactsId === contactsModal.id ? (
                <p className="text-sm text-zinc-500">Loading contacts…</p>
              ) : (contactsByBusiness[contactsModal.id]?.length ?? 0) === 0 ? (
                <p className="text-sm text-zinc-500">No results yet — click Verify.</p>
              ) : (
                (() => {
                  const result = contactsByBusiness[contactsModal.id]?.[0];
                  if (!result) return null;
                  const reviews = result.reviewsJson ?? [];
                  const photos = result.photoUrls ?? [];
                  const hasAnything =
                    result.facebookUrl || result.instagramUrl || reviews.length > 0 || photos.length > 0;
                  return (
                    <div className="rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-zinc-900 dark:text-zinc-50">
                          Social &amp; reviews
                        </p>
                        {result.matchConfidence &&
                        result.matchConfidence !== "none" ? (
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                              result.matchConfidence === "high"
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                                : "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                            }`}
                          >
                            {result.matchConfidence} confidence match
                          </span>
                        ) : null}
                      </div>
                      {result.matchNotes ? (
                        <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                          {result.matchNotes}
                        </p>
                      ) : null}

                      {!hasAnything ? (
                        <p className="mt-2 text-sm text-zinc-500">
                          No Facebook, Instagram, reviews, or photos found.
                        </p>
                      ) : (
                        <>
                          <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
                            {result.facebookUrl ? (
                              <>
                                <dt className="text-zinc-400">Facebook</dt>
                                <dd>
                                  <a
                                    href={result.facebookUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="break-all text-sky-700 underline-offset-2 hover:underline dark:text-sky-300"
                                  >
                                    {result.facebookUrl}
                                  </a>
                                </dd>
                              </>
                            ) : null}
                            {result.instagramUrl ? (
                              <>
                                <dt className="text-zinc-400">Instagram</dt>
                                <dd>
                                  <a
                                    href={result.instagramUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="break-all text-sky-700 underline-offset-2 hover:underline dark:text-sky-300"
                                  >
                                    {result.instagramUrl}
                                  </a>
                                </dd>
                              </>
                            ) : null}
                          </dl>

                          {reviews.length > 0 ? (
                            <div className="mt-3">
                              <p className="text-xs font-semibold text-zinc-500">
                                Reviews
                              </p>
                              <ul className="mt-1.5 flex flex-col gap-2">
                                {reviews.map((review, index) => (
                                  <li
                                    key={index}
                                    className="rounded-lg bg-zinc-50 p-2 text-xs dark:bg-zinc-950/40"
                                  >
                                    <div className="flex flex-wrap items-baseline gap-x-2">
                                      {review.author ? (
                                        <span className="font-medium text-zinc-700 dark:text-zinc-300">
                                          {review.author}
                                        </span>
                                      ) : null}
                                      {review.rating != null ? (
                                        <span className="text-zinc-400">
                                          {review.rating}★
                                        </span>
                                      ) : null}
                                      {review.source ? (
                                        <span className="text-zinc-400">
                                          · {review.source}
                                        </span>
                                      ) : null}
                                    </div>
                                    {review.text ? (
                                      <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                                        {review.text}
                                      </p>
                                    ) : null}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}

                          {photos.length > 0 ? (
                            <div className="mt-3">
                              <p className="text-xs font-semibold text-zinc-500">
                                Photos
                              </p>
                              <div className="mt-1.5 grid grid-cols-3 gap-2 sm:grid-cols-4">
                                {photos.map((url) => (
                                  <a
                                    key={url}
                                    href={url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="block overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={url}
                                      alt=""
                                      className="aspect-square w-full object-cover"
                                      loading="lazy"
                                    />
                                  </a>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </>
                      )}

                      {result.tavilyRawJson ? (
                        <details className="mt-3">
                          <summary className="cursor-pointer text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
                            Raw response
                          </summary>
                          <pre className="mt-1 max-h-64 overflow-auto rounded-lg bg-zinc-100 p-2 text-[11px] leading-relaxed text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                            {JSON.stringify(result.tavilyRawJson, null, 2)}
                          </pre>
                        </details>
                      ) : null}
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
