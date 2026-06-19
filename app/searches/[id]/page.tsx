"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { BusinessDetailModal } from "@/components/BusinessDetailModal";
import { LeadsTable } from "@/components/LeadsTable";
import { ProposalModal } from "@/components/ProposalModal";
import { isProposalInProgress, isProposalReplied, isProposalSent } from "@/lib/proposal-status";
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

  const repliedLeads = leads
    .filter((l) => l.proposal && isProposalReplied(l.proposal.status))
    .sort((a, b) => {
      const aTime = a.proposal?.repliedAt ? Date.parse(a.proposal.repliedAt) : 0;
      const bTime = b.proposal?.repliedAt ? Date.parse(b.proposal.repliedAt) : 0;
      return bTime - aTime;
    });

  const loadSearch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/searches/${id}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to load search");
        return;
      }
      setSearch(data.search);
      setLeads(data.leads);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    whatsappCheckStarted.current = false;
    loadSearch();
  }, [loadSearch]);

  useEffect(() => {
    fetch("/api/whatsapp/status")
      .then((res) => res.json())
      .then((data) => {
        setWhatsappConfigured(Boolean(data.sendConfigured));
      })
      .catch(() => setWhatsappConfigured(false));
  }, []);

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

  async function handleSendWhatsApp(body: string) {
    if (!activeLead) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${activeLead.id}/whatsapp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send WhatsApp message");
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
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          {search.query}
        </h1>
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
        onViewBusiness={openBusinessView}
        onCreateProposal={openCreate}
        onEditProposal={openEdit}
        onViewProposal={openView}
      />

      <BusinessDetailModal
        open={businessModalOpen}
        leadId={businessLeadId}
        onClose={() => {
          setBusinessModalOpen(false);
          setBusinessLeadId(null);
        }}
      />

      {activeLead && (
        <ProposalModal
          open={modalOpen}
          mode={modalMode}
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
        />
      )}
    </main>
  );
}
