"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ProposalModal } from "@/components/ProposalModal";
import type { ProposalSummary } from "@/lib/types";

type CampaignStatus = "draft" | "active" | "completed" | "archived";

type CampaignBusiness = {
  id: string;
  title: string;
  industry: string;
  location: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  hasWebsite: boolean;
  websiteCheckState: string | null;
  contactsFound: number | null;
  contactsStatus: string | null;
  contactsVerifiedAt: string | null;
  address: string | null;
  rating: number | null;
  reviews: number | null;
  mapsUrl: string | null;
  searchId: string;
  createdAt: string;
  demoEnabled: boolean;
  demoTemplate: string | null;
  leadId: string | null;
  leadPlaceId: string | null;
  hasWhatsapp: boolean | null;
};

type CampaignResults = {
  businessCount: number;
  leadsCreated: number;
  demosBuilt: number;
  proposalsCreated: number;
  proposalsSent: number;
  proposalsDelivered: number;
  proposalsRead: number;
  proposalsReplied: number;
};

type CampaignMeta = {
  id: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  createdAt: string;
  updatedAt: string;
};

type CampaignDetailResponse =
  | {
      campaign: CampaignMeta;
      results: CampaignResults;
      businesses: CampaignBusiness[];
    }
  | { error: string };

const STATUS_BADGE: Record<CampaignStatus, string> = {
  draft: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  active:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  completed: "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
  archived: "bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-500",
};

const STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: "Draft",
  active: "Active",
  completed: "Completed",
  archived: "Archived",
};

const STAT_LABELS: Array<{ key: keyof CampaignResults; label: string }> = [
  { key: "businessCount", label: "Businesses" },
  { key: "leadsCreated", label: "Leads created" },
  { key: "demosBuilt", label: "Demos built" },
  { key: "proposalsCreated", label: "Proposals created" },
  { key: "proposalsSent", label: "Sent" },
  { key: "proposalsDelivered", label: "Delivered" },
  { key: "proposalsRead", label: "Read" },
  { key: "proposalsReplied", label: "Replied" },
];

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const campaignId = params.id;

  const [campaign, setCampaign] = useState<CampaignMeta | null>(null);
  const [results, setResults] = useState<CampaignResults | null>(null);
  const [businesses, setBusinesses] = useState<CampaignBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [changingStatus, setChangingStatus] = useState(false);
  const [confirmingStatus, setConfirmingStatus] = useState<CampaignStatus | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [creatingDemoId, setCreatingDemoId] = useState<string | null>(null);
  const [demoToast, setDemoToast] = useState<string | null>(null);

  const [proposalModalOpen, setProposalModalOpen] = useState(false);
  const [proposalBusiness, setProposalBusiness] = useState<CampaignBusiness | null>(
    null,
  );
  const [proposalLeadId, setProposalLeadId] = useState<string | null>(null);
  const [proposalSaving, setProposalSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as CampaignDetailResponse;
      if (!res.ok || "error" in data) {
        setError("error" in data ? data.error : "Failed to load campaign");
        return;
      }
      setCampaign(data.campaign);
      setResults(data.results);
      setBusinesses(data.businesses);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function ensureLead(business: CampaignBusiness): Promise<string | null> {
    if (business.leadId) return business.leadId;
    try {
      const res = await fetch(
        `/api/campaigns/${campaignId}/businesses/${business.id}/ensure-lead`,
        { method: "POST" },
      );
      const data = (await res.json()) as { leadId?: string; error?: string };
      if (!res.ok || !data.leadId) {
        setError(data.error ?? "Failed to prepare business for outreach");
        return null;
      }
      setBusinesses((prev) =>
        prev.map((b) =>
          b.id === business.id ? { ...b, leadId: data.leadId ?? null } : b,
        ),
      );
      return data.leadId;
    } catch {
      setError("Network error");
      return null;
    }
  }

  async function handleCreateDemo(business: CampaignBusiness) {
    setCreatingDemoId(business.id);
    setError(null);
    try {
      const leadId = await ensureLead(business);
      if (!leadId) return;
      setDemoToast(
        `Your demo for ${business.title} is in progress. Check back in a few minutes.`,
      );
      const res = await fetch(`/api/leads/${leadId}/demo`, { method: "POST" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to create demo");
        setDemoToast(null);
        return;
      }
      if (res.status !== 202) {
        setDemoToast(`Demo for ${business.title} is ready.`);
      }
      await load();
    } catch {
      setError("Network error while creating demo");
      setDemoToast(null);
    } finally {
      setCreatingDemoId(null);
    }
  }

  async function handleOpenProposal(business: CampaignBusiness) {
    setError(null);
    const leadId = await ensureLead(business);
    if (!leadId) return;
    setProposalBusiness(business);
    setProposalLeadId(leadId);
    setProposalModalOpen(true);
  }

  async function handleSaveProposal(body: string): Promise<ProposalSummary> {
    if (!proposalLeadId) throw new Error("No lead selected");
    setProposalSaving(true);
    try {
      const res = await fetch(`/api/leads/${proposalLeadId}/proposal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      await load();
      return data.proposal as ProposalSummary;
    } finally {
      setProposalSaving(false);
    }
  }

  async function handleSendWhatsApp() {
    // Sending from the campaign detail page is out of scope for v1 — WhatsApp
    // sends happen from the search detail page's existing chat flow.
    throw new Error("Send from the search detail page for this lead.");
  }

  async function changeStatus(nextStatus: CampaignStatus) {
    setChangingStatus(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Failed to update campaign status");
        return;
      }
      setConfirmingStatus(null);
      await load();
    } catch {
      setError("Network error");
    } finally {
      setChangingStatus(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Failed to delete campaign");
        return;
      }
      router.push("/campaigns");
    } catch {
      setError("Network error");
    } finally {
      setDeleting(false);
    }
  }

  async function exportCsv() {
    setExporting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/businesses?campaign=${campaignId}&format=csv`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        setError("Export failed");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `campaign-${campaignId}-${new Date().toISOString().slice(0, 10)}.csv`;
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

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-sm text-zinc-500">Loading campaign…</p>
      </main>
    );
  }

  if (!campaign) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error ?? "Campaign not found"}
        </p>
      </main>
    );
  }

  const isTerminal = campaign.status === "completed" || campaign.status === "archived";

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <Link
        href="/campaigns"
        className="inline-flex text-sm font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
      >
        ← Back to campaigns
      </Link>

      <header className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-[-0.035em] text-zinc-900 dark:text-zinc-50">
              {campaign.name}
            </h1>
            <span
              className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[campaign.status]}`}
            >
              {STATUS_LABEL[campaign.status]}
            </span>
          </div>
          {campaign.description ? (
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {campaign.description}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {campaign.status === "draft" && (
            <>
              <button
                type="button"
                onClick={() => setConfirmingStatus("active")}
                disabled={changingStatus}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                Activate
              </button>
              <button
                type="button"
                onClick={() => setConfirmingStatus("archived")}
                disabled={changingStatus}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Archive
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={deleting}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40"
              >
                Delete
              </button>
            </>
          )}
          {campaign.status === "active" && (
            <>
              <button
                type="button"
                onClick={() => setConfirmingStatus("completed")}
                disabled={changingStatus}
                className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
              >
                Mark Completed
              </button>
              <button
                type="button"
                onClick={() => setConfirmingStatus("archived")}
                disabled={changingStatus}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Archive
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => void exportCsv()}
            disabled={exporting}
            className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-60"
          >
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
        </div>
      )}

      {demoToast && (
        <div
          role="status"
          className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100"
        >
          {demoToast}
        </div>
      )}

      {results && (
        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {STAT_LABELS.map(({ key, label }) => (
            <div
              key={key}
              className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {label}
              </div>
              <div className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                {results[key]}
              </div>
            </div>
          ))}
        </section>
      )}

      <div className="mt-8 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/40">
        Campaign URLs — coming soon.
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/60">
            <tr>
              <th className="w-[20%] px-3 py-3 font-medium">Business</th>
              <th className="w-[12%] px-3 py-3 font-medium">Industry</th>
              <th className="w-[12%] px-3 py-3 font-medium">Location</th>
              <th className="w-[10%] px-3 py-3 font-medium">Rating</th>
              <th className="w-[13%] px-3 py-3 font-medium">Phone</th>
              <th className="w-[15%] px-3 py-3 font-medium">Website</th>
              {!isTerminal && (
                <th className="w-[18%] px-3 py-3 font-medium">Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {businesses.length === 0 ? (
              <tr>
                <td colSpan={isTerminal ? 6 : 7} className="px-3 py-8 text-zinc-500">
                  No businesses in this campaign.
                </td>
              </tr>
            ) : (
              businesses.map((business) => (
                <tr
                  key={business.id}
                  className="border-t border-zinc-100 dark:border-zinc-800"
                >
                  <td className="px-3 py-3 align-top">
                    <div className="truncate font-medium text-zinc-900 dark:text-zinc-50">
                      {business.mapsUrl ? (
                        <a
                          href={business.mapsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="underline-offset-2 hover:underline"
                          title={business.title}
                        >
                          {business.title}
                        </a>
                      ) : (
                        <span title={business.title}>{business.title}</span>
                      )}
                    </div>
                    {business.address ? (
                      <div
                        className="mt-0.5 truncate text-xs text-zinc-500"
                        title={business.address}
                      >
                        {business.address}
                      </div>
                    ) : null}
                  </td>
                  <td
                    className="truncate px-3 py-3 align-top text-zinc-700 dark:text-zinc-300"
                    title={business.industry}
                  >
                    {business.industry}
                  </td>
                  <td
                    className="truncate px-3 py-3 align-top text-zinc-700 dark:text-zinc-300"
                    title={business.location}
                  >
                    {business.location}
                  </td>
                  <td className="truncate px-3 py-3 align-top text-zinc-700 dark:text-zinc-300">
                    {business.rating != null ? (
                      <>
                        {business.rating.toFixed(1)}★
                        {business.reviews != null ? (
                          <span className="text-xs text-zinc-500">
                            {" "}
                            ({business.reviews})
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="truncate px-3 py-3 align-top text-zinc-700 dark:text-zinc-300">
                    {business.phone ?? "—"}
                  </td>
                  <td className="truncate px-3 py-3 align-top text-zinc-700 dark:text-zinc-300">
                    {business.website ? (
                      business.website.replace(/^https?:\/\//, "")
                    ) : (
                      <span className="text-zinc-400">No website</span>
                    )}
                  </td>
                  {!isTerminal && (
                    <td className="px-3 py-3 align-top">
                      <div className="flex flex-wrap gap-1.5">
                        {business.demoEnabled && (
                          <button
                            type="button"
                            onClick={() => void handleCreateDemo(business)}
                            disabled={creatingDemoId === business.id}
                            className="rounded-lg border border-sky-300 px-2.5 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50 disabled:opacity-60 dark:border-sky-800 dark:text-sky-300 dark:hover:bg-sky-950/40"
                          >
                            {creatingDemoId === business.id
                              ? "Creating…"
                              : "Create Demo"}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleOpenProposal(business)}
                          className="rounded-lg border border-emerald-300 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                        >
                          Create Proposal
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {proposalBusiness && proposalLeadId && (
        <ProposalModal
          open={proposalModalOpen}
          mode="create"
          searchId={proposalBusiness.searchId}
          leadId={proposalLeadId}
          businessName={proposalBusiness.title}
          industry={proposalBusiness.industry}
          location={proposalBusiness.location}
          leadPhone={proposalBusiness.phone}
          hasWhatsapp={proposalBusiness.hasWhatsapp}
          whatsappConfigured={false}
          initialBody=""
          proposal={null}
          saving={proposalSaving}
          onClose={() => setProposalModalOpen(false)}
          onSave={handleSaveProposal}
          onSendWhatsApp={handleSendWhatsApp}
        />
      )}

      {confirmingStatus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {confirmingStatus === "active"
                ? "Activate campaign?"
                : confirmingStatus === "completed"
                  ? "Mark campaign completed?"
                  : "Archive campaign?"}
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              {confirmingStatus === "active"
                ? "This marks the campaign as active. Businesses stay assigned to it."
                : "This campaign's businesses will become available for a new campaign. This campaign's history and results stay visible here."}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmingStatus(null)}
                disabled={changingStatus}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void changeStatus(confirmingStatus)}
                disabled={changingStatus}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {changingStatus ? "Updating…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Delete campaign?
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              This campaign and its business memberships will be permanently
              deleted. This action cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Delete campaign"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
