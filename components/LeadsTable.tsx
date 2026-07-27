"use client";

import Link from "next/link";
import { PhoneCell } from "@/components/PhoneCell";
import { isProposalReplied, isProposalSent } from "@/lib/proposal-status";
import type { LeadWithProposal, SearchDetail } from "@/lib/types";

interface LeadsTableProps {
  search: SearchDetail;
  leads: LeadWithProposal[];
  checkingWhatsapp?: boolean;
  creatingDemoLeadId?: string | null;
  onViewBusiness: (lead: LeadWithProposal) => void;
  onCreateProposal: (lead: LeadWithProposal) => void;
  onEditProposal: (lead: LeadWithProposal) => void;
  onViewProposal: (lead: LeadWithProposal) => void;
  onCreateDemo: (lead: LeadWithProposal) => void;
}

export function LeadsTable({
  search,
  leads,
  checkingWhatsapp = false,
  creatingDemoLeadId = null,
  onViewBusiness,
  onCreateProposal,
  onEditProposal,
  onViewProposal,
  onCreateDemo,
}: LeadsTableProps) {
  if (leads.length === 0) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        No leads without a website were found for this search.
      </p>
    );
  }

  return (
    <section className="space-y-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {search.totalWithoutWebsite} leads without a website · scanned{" "}
        {search.totalFetched} businesses
      </p>
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="hidden overflow-x-auto sm:block">
          <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
            <thead className="bg-zinc-50 dark:bg-zinc-950/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Business
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Phone
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Rating
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {leads.map((lead) => (
                <tr
                  key={lead.id}
                  className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">
                      {lead.title}
                    </p>
                    <p className="text-xs text-zinc-500">{lead.address ?? "—"}</p>
                    {lead.proposal && isProposalReplied(lead.proposal.status) && (
                      <p className="mt-1 text-xs font-medium text-sky-700 dark:text-sky-300">
                        Replied {formatRelativeTime(lead.proposal.repliedAt)}
                      </p>
                    )}
                    {lead.proposal && isProposalSent(lead.proposal.status) && lead.proposal.followUpLabel && (
                      <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                        {lead.proposal.followUpLabel}
                      </p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                    <PhoneCell
                      phone={lead.phone}
                      hasWhatsapp={lead.hasWhatsapp}
                      checking={
                        checkingWhatsapp && lead.phone != null && lead.hasWhatsapp === null
                      }
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                    {formatRating(lead)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-nowrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => onViewBusiness(lead)}
                        className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300"
                        title="View business details"
                      >
                        <InfoIcon />
                        Details
                      </button>
                      <ProposalAction
                        lead={lead}
                        creatingDemo={creatingDemoLeadId === lead.id}
                        onCreate={onCreateProposal}
                        onEdit={onEditProposal}
                        onView={onViewProposal}
                        onCreateDemo={onCreateDemo}
                      />
                      {lead.proposal && isProposalReplied(lead.proposal.status) && (
                        <Link
                          href="/agent/chat"
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-sky-300 px-3 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-50 dark:border-sky-800 dark:text-sky-200 dark:hover:bg-sky-950/40"
                        >
                          View chat
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="divide-y divide-zinc-100 sm:hidden dark:divide-zinc-800">
          {leads.map((lead) => (
            <li key={lead.id} className="space-y-2 px-4 py-4">
              <p className="font-medium">{lead.title}</p>
              {lead.proposal && isProposalReplied(lead.proposal.status) && (
                <p className="text-xs font-medium text-sky-700 dark:text-sky-300">
                  Replied {formatRelativeTime(lead.proposal.repliedAt)}
                </p>
              )}
              {lead.proposal && isProposalSent(lead.proposal.status) && lead.proposal.followUpLabel && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  {lead.proposal.followUpLabel}
                </p>
              )}
              <PhoneCell
                phone={lead.phone}
                hasWhatsapp={lead.hasWhatsapp}
                checking={
                  checkingWhatsapp && lead.phone != null && lead.hasWhatsapp === null
                }
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onViewBusiness(lead)}
                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:border-zinc-600 dark:text-zinc-300"
                >
                  Details
                </button>
                <ProposalAction
                  lead={lead}
                  creatingDemo={creatingDemoLeadId === lead.id}
                  onCreate={onCreateProposal}
                  onEdit={onEditProposal}
                  onView={onViewProposal}
                  onCreateDemo={onCreateDemo}
                />
                {lead.proposal && isProposalReplied(lead.proposal.status) && (
                  <Link
                    href="/agent/chat"
                    className="rounded-lg border border-sky-300 px-3 py-1.5 text-xs font-medium text-sky-800 dark:border-sky-800 dark:text-sky-200"
                  >
                    View chat
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function ViewDemoButton({ demoUrl }: { demoUrl: string }) {
  return (
    <a
      href={demoUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-200 dark:hover:bg-emerald-950/40"
      title="Open demo site"
    >
      <ExternalLinkIcon />
      View demo
    </a>
  );
}

function CreateDemoLink({
  lead,
  creatingDemo,
  onCreateDemo,
}: {
  lead: LeadWithProposal;
  creatingDemo: boolean;
  onCreateDemo: (lead: LeadWithProposal) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onCreateDemo(lead)}
      disabled={creatingDemo}
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-sky-300 px-3 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-50 disabled:opacity-60 dark:border-sky-800 dark:text-sky-200 dark:hover:bg-sky-950/40"
      title="Create demo site"
    >
      {creatingDemo ? "Creating demo…" : "Create demo"}
    </button>
  );
}

function ProposalAction({
  lead,
  creatingDemo,
  onCreate,
  onEdit,
  onView,
  onCreateDemo,
}: {
  lead: LeadWithProposal;
  creatingDemo: boolean;
  onCreate: (lead: LeadWithProposal) => void;
  onEdit: (lead: LeadWithProposal) => void;
  onView: (lead: LeadWithProposal) => void;
  onCreateDemo: (lead: LeadWithProposal) => void;
}) {
  if (!lead.proposal) {
    return (
      <div className="flex justify-end gap-2">
        <CreateDemoLink lead={lead} creatingDemo={creatingDemo} onCreateDemo={onCreateDemo} />
      </div>
    );
  }

  if (!lead.proposal.body?.trim() && !isProposalSent(lead.proposal.status) && !isProposalReplied(lead.proposal.status)) {
    return (
      <div className="flex justify-end gap-2">
        {lead.proposal.demoUrl ? (
          <>
            <ViewDemoButton demoUrl={lead.proposal.demoUrl} />
            <button
              type="button"
              onClick={() => onCreate(lead)}
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
              title="Create proposal"
            >
              <PlusIcon />
              Create
            </button>
          </>
        ) : (
          <CreateDemoLink lead={lead} creatingDemo={creatingDemo} onCreateDemo={onCreateDemo} />
        )}
      </div>
    );
  }

  if (isProposalReplied(lead.proposal.status)) {
    return (
      <div className="flex justify-end gap-2">
        {lead.proposal.demoUrl && <ViewDemoButton demoUrl={lead.proposal.demoUrl} />}
        <button
          type="button"
          onClick={() => onView(lead)}
          className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-sky-300 px-3 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-50 dark:border-sky-800 dark:text-sky-200"
          title="View proposal"
        >
          <EyeIcon />
          View proposal
        </button>
      </div>
    );
  }

  if (isProposalSent(lead.proposal.status)) {
    return (
      <div className="flex justify-end gap-2">
        {lead.proposal.demoUrl && <ViewDemoButton demoUrl={lead.proposal.demoUrl} />}
        <button
          type="button"
          onClick={() => onView(lead)}
          className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300"
          title="View proposal"
        >
          <EyeIcon />
          View proposal
        </button>
      </div>
    );
  }

  return (
    <div className="flex justify-end gap-2">
      {lead.proposal.demoUrl && <ViewDemoButton demoUrl={lead.proposal.demoUrl} />}
      <button
        type="button"
        onClick={() => onEdit(lead)}
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300"
        title="View proposal"
      >
        <EyeIcon />
        {lead.proposal.demoUrl ? "View proposal" : "Edit (In progress)"}
      </button>
    </div>
  );
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function formatRating(lead: LeadWithProposal): string {
  if (lead.rating == null) return "—";
  const reviews =
    lead.reviews != null ? ` (${lead.reviews})` : "";
  return `${lead.rating}★${reviews}`;
}

function PlusIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
