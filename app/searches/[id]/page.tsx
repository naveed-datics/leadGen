"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { BusinessDetailModal } from "@/components/BusinessDetailModal";
import { LeadsTable } from "@/components/LeadsTable";
import { ProposalModal } from "@/components/ProposalModal";
import { ProposalSettingsModal } from "@/components/ProposalSettingsModal";
import { ToastStack } from "@/components/Toast";
import { isProposalInProgress, isProposalReplied, isProposalSent } from "@/lib/proposal-status";
import { DEMO_STATUS_BUILDING, DEMO_STATUS_READY } from "@/lib/demo-status";
import type { LeadWithProposal, ProposalSummary, SearchDetail } from "@/lib/types";

type ModalMode = "create" | "edit" | "view";
type LeadListMode = "all" | "in_progress" | "applied" | "replied";

export default function SearchDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [search, setSearch] = useState<SearchDetail | null>(null);
  const [leads, setLeads] = useState<LeadWithProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("create");
  const [activeLead, setActiveLead] = useState<LeadWithProposal | null>(null);
  const [businessModalOpen, setBusinessModalOpen] = useState(false);
  const [businessLeadId, setBusinessLeadId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [checkingWhatsapp, setCheckingWhatsapp] = useState(false);
  const [whatsappConfigured, setWhatsappConfigured] = useState(false);
  const whatsappCheckStarted = useRef(false);
  const [leadListMode, setLeadListMode] = useState<LeadListMode>("all");
  const [creatingDemoLeadId, setCreatingDemoLeadId] = useState<string | null>(null);
  const [demoEnabled, setDemoEnabled] = useState<boolean | null>(null);
  const [enablingDemo, setEnablingDemo] = useState(false);
  const [searchSettingsOpen, setSearchSettingsOpen] = useState(false);
  const [toasts, setToasts] = useState<
    { id: string; message: string; variant?: "info" | "success" | "error" }[]
  >([]);

  const pushToast = useCallback(
    (message: string, variant?: "info" | "success" | "error") => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, message, variant }]);
    },
    [],
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const repliedLeads = leads
    .filter((l) => l.proposal && isProposalReplied(l.proposal.status))
    .sort((a, b) => {
      const aTime = a.proposal?.repliedAt ? Date.parse(a.proposal.repliedAt) : 0;
      const bTime = b.proposal?.repliedAt ? Date.parse(b.proposal.repliedAt) : 0;
      return bTime - aTime;
    });

  const loadSearch = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const res = await fetch(`/api/searches/${id}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to load search");
        return null;
      }
      setSearch(data.search);
      setLeads(data.leads);
      return data.leads as LeadWithProposal[];
    } catch {
      setError("Network error");
      return null;
    } finally {
      if (!opts?.silent) {
        setLoading(false);
      }
    }
  }, [id]);

  useEffect(() => {
    whatsappCheckStarted.current = false;
    void loadSearch();
  }, [loadSearch]);

  const hasBuildingDemos = leads.some(
    (l) => l.proposal?.demoStatus === DEMO_STATUS_BUILDING,
  );
  const prevDemoStatusRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!hasBuildingDemos) return;

    const intervalId = window.setInterval(() => {
      void loadSearch({ silent: true });
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [hasBuildingDemos, loadSearch]);

  useEffect(() => {
    for (const lead of leads) {
      const prev = prevDemoStatusRef.current.get(lead.id);
      const curr = lead.proposal?.demoStatus ?? "none";
      if (
        prev === DEMO_STATUS_BUILDING &&
        curr === DEMO_STATUS_READY &&
        lead.proposal?.demoUrl
      ) {
        pushToast(`Demo for ${lead.title} is ready.`, "success");
      }
      prevDemoStatusRef.current.set(lead.id, curr);
    }
  }, [leads, pushToast]);

  useEffect(() => {
    fetch("/api/whatsapp/status")
      .then((res) => res.json())
      .then((data) => {
        setWhatsappConfigured(Boolean(data.sendConfigured));
      })
      .catch(() => setWhatsappConfigured(false));
  }, []);

  const loadDemoEnabled = useCallback(async () => {
    try {
      const res = await fetch(`/api/searches/${id}/settings/proposal-template`, {
        cache: "no-store",
      });
      const data = await res.json();
      setDemoEnabled(Boolean(data.demoEnabled));
    } catch {
      setDemoEnabled(null);
    }
  }, [id]);

  useEffect(() => {
    void loadDemoEnabled();
  }, [loadDemoEnabled]);

  async function handleEnableDemo() {
    setEnablingDemo(true);
    try {
      const res = await fetch(`/api/searches/${id}/settings/proposal-template`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demoEnabled: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to enable demo");
      setDemoEnabled(true);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to enable demo");
    } finally {
      setEnablingDemo(false);
    }
  }

  const checkWhatsapp = useCallback(async (searchId: string) => {
    setCheckingWhatsapp(true);
    try {
      const res = await fetch("/api/whatsapp/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ searchId }),
      });
      const data = await res.json();
      if (!res.ok) return;

      const results = data.results as Record<string, boolean>;
      setLeads((prev) =>
        prev.map((lead) =>
          results[lead.id] !== undefined
            ? { ...lead, hasWhatsapp: results[lead.id] }
            : lead,
        ),
      );
    } finally {
      setCheckingWhatsapp(false);
    }
  }, []);

  useEffect(() => {
    if (!search || leads.length === 0 || whatsappCheckStarted.current) return;

    const needsCheck = leads.some(
      (lead) => lead.phone && lead.hasWhatsapp === null,
    );
    if (!needsCheck) return;

    whatsappCheckStarted.current = true;
    checkWhatsapp(search.id);
  }, [search, leads, checkWhatsapp]);

  function openCreate(lead: LeadWithProposal) {
    setActiveLead(lead);
    setModalMode("create");
    setModalOpen(true);
  }

  function openEdit(lead: LeadWithProposal) {
    setActiveLead(lead);
    setModalMode("edit");
    setModalOpen(true);
  }

  function openView(lead: LeadWithProposal) {
    setActiveLead(lead);
    setModalMode("view");
    setModalOpen(true);
  }

  function openBusinessView(lead: LeadWithProposal) {
    setBusinessLeadId(lead.id);
    setBusinessModalOpen(true);
  }

  function getInitialBody(): string {
    if (!activeLead) return "";
    return activeLead.proposal?.body ?? "";
  }

  function updateLeadProposal(leadId: string, proposal: ProposalSummary) {
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, proposal } : l)),
    );
  }

  function handleDemoCreated(proposal: ProposalSummary) {
    if (!activeLead) return;
    updateLeadProposal(activeLead.id, proposal);
    setActiveLead((l) => (l ? { ...l, proposal } : l));
  }

  async function handleCreateDemoInline(lead: LeadWithProposal) {
    setCreatingDemoLeadId(lead.id);
    pushToast(
      `Your demo for ${lead.title} is in progress. We'll notify you when it's ready, or check back in a few minutes.`,
      "info",
    );
    try {
      const res = await fetch(`/api/leads/${lead.id}/demo`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create demo");
      if (data.proposal) {
        updateLeadProposal(lead.id, data.proposal);
      }
      if (res.status === 202 || data.accepted) {
        return;
      }
      pushToast(`Demo for ${lead.title} is ready.`, "success");
    } catch (e) {
      pushToast(
        e instanceof Error ? e.message : "Failed to create demo",
        "error",
      );
    } finally {
      setCreatingDemoLeadId(null);
    }
  }

  async function handleSave(body: string): Promise<ProposalSummary> {
    if (!activeLead) {
      throw new Error("No active lead selected");
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${activeLead.id}/proposal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      updateLeadProposal(activeLead.id, data.proposal);
      setActiveLead((l) => (l ? { ...l, proposal: data.proposal } : l));
      return data.proposal as ProposalSummary;
    } catch (e) {
      alert(e instanceof Error ? e.message : "Save failed");
      throw e;
    } finally {
      setSaving(false);
    }
  }

  async function handleSendWhatsApp(body: string, testPhone?: string) {
    if (!activeLead) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${activeLead.id}/whatsapp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, testPhone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send WhatsApp message");

      if (testPhone) {
        alert(`Test message sent to ${testPhone}`);
        return;
      }

      updateLeadProposal(activeLead.id, data.proposal);
      setModalMode("view");
      setActiveLead((l) => (l ? { ...l, proposal: data.proposal } : l));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to send WhatsApp message");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <p className="text-sm text-zinc-500">Loading…</p>
      </main>
    );
  }

  if (error || !search) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <p className="text-sm text-red-600">{error ?? "Not found"}</p>
        <Link href="/searches" className="mt-4 inline-block text-sm text-emerald-600">
          Back to history
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6 sm:py-14">
      <header className="space-y-2">
        <Link
          href="/searches"
          className="text-sm text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
        >
          ← Back to history
        </Link>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            {search.query}
          </h1>
          <button
            type="button"
            onClick={() => setSearchSettingsOpen(true)}
            className="shrink-0 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            Search settings
          </button>
        </div>
        <p className="text-sm text-zinc-500">
          {new Date(search.createdAt).toLocaleString("en-US", {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </p>
        {checkingWhatsapp && (
          <p className="text-xs text-zinc-500">Checking WhatsApp numbers…</p>
        )}
      </header>

      {demoEnabled === false && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <span>Demo sites are off for this search. Enable them to use Create demo / Create.</span>
          <button
            type="button"
            disabled={enablingDemo}
            onClick={() => void handleEnableDemo()}
            className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-60"
          >
            {enablingDemo ? "Enabling…" : "Enable demo"}
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setLeadListMode("all")}
          className={[
            "rounded-xl border px-3 py-1.5 text-sm font-medium transition",
            leadListMode === "all"
              ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100"
              : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900",
          ].join(" ")}
        >
          All leads ({leads.length})
        </button>
        <button
          type="button"
          onClick={() => setLeadListMode("in_progress")}
          className={[
            "rounded-xl border px-3 py-1.5 text-sm font-medium transition",
            leadListMode === "in_progress"
              ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100"
              : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900",
          ].join(" ")}
        >
          In progress (
          {
            leads.filter(
              (l) => l.proposal && isProposalInProgress(l.proposal.status),
            ).length
          }
          )
        </button>
        <button
          type="button"
          onClick={() => setLeadListMode("applied")}
          className={[
            "rounded-xl border px-3 py-1.5 text-sm font-medium transition",
            leadListMode === "applied"
              ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100"
              : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900",
          ].join(" ")}
        >
          Applied / submitted (
          {leads.filter((l) => l.proposal && isProposalSent(l.proposal.status)).length}
          )
        </button>
        <button
          type="button"
          onClick={() => setLeadListMode("replied")}
          className={[
            "rounded-xl border px-3 py-1.5 text-sm font-medium transition",
            leadListMode === "replied"
              ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100"
              : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900",
          ].join(" ")}
        >
          Replied ({repliedLeads.length})
        </button>
      </div>

      <LeadsTable
        search={search}
        leads={
          leadListMode === "in_progress"
            ? leads.filter(
                (l) => l.proposal && isProposalInProgress(l.proposal.status),
              )
            : leadListMode === "applied"
              ? leads.filter(
                  (l) => l.proposal && isProposalSent(l.proposal.status),
                )
              : leadListMode === "replied"
                ? repliedLeads
                : leads
        }
        checkingWhatsapp={checkingWhatsapp}
        creatingDemoLeadId={creatingDemoLeadId}
        onViewBusiness={openBusinessView}
        onCreateProposal={openCreate}
        onEditProposal={openEdit}
        onViewProposal={openView}
        onCreateDemo={handleCreateDemoInline}
      />

      <BusinessDetailModal
        open={businessModalOpen}
        leadId={businessLeadId}
        onClose={() => {
          setBusinessModalOpen(false);
          setBusinessLeadId(null);
        }}
      />

      <ProposalSettingsModal
        open={searchSettingsOpen}
        searchId={search.id}
        searchQuery={search.query}
        onClose={() => setSearchSettingsOpen(false)}
        onSaved={() => void loadDemoEnabled()}
      />

      {activeLead && (
        <ProposalModal
          open={modalOpen}
          mode={modalMode}
          searchId={search.id}
          leadId={activeLead.id}
          businessName={activeLead.title}
          industry={search.industry}
          location={search.location}
          leadPhone={activeLead.phone}
          hasWhatsapp={activeLead.hasWhatsapp}
          whatsappConfigured={whatsappConfigured}
          initialBody={getInitialBody()}
          proposal={activeLead.proposal}
          saving={saving}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
          onSendWhatsApp={handleSendWhatsApp}
          onDemoCreated={handleDemoCreated}
        />
      )}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </main>
  );
}
