"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type InboundLead = {
  id: string;
  conversationId: string | null;
  businessName: string;
  phone: string;
  industry: string | null;
  firstReplyAt: string;
  lastReplyAt: string;
  lastReplyBody: string | null;
  agentName: string | null;
};

export default function InboundLeadsPage() {
  const [leads, setLeads] = useState<InboundLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/leads/inbound", { cache: "no-store" });
      const data = (await res.json()) as { leads?: InboundLead[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load leads");
      setLeads(data.leads ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load leads");
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLeads();
    const intervalId = setInterval(() => void loadLeads(), 5000);
    return () => clearInterval(intervalId);
  }, [loadLeads]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6 sm:py-14">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Leads
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          WhatsApp replies from unique numbers you contacted. Each new reply creates a lead
          for follow-up.
        </p>
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : leads.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No inbound leads yet. When a contact replies on WhatsApp, they appear here.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
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
                    Industry
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Last reply
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
                    className="hover:bg-zinc-50/80 dark:hover:bg-zinc-900/30"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-zinc-900 dark:text-zinc-50">
                        {lead.businessName}
                      </p>
                      {lead.agentName && (
                        <p className="text-xs text-zinc-500">Agent: {lead.agentName}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                      {lead.phone}
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                      {lead.industry ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                      <time dateTime={lead.lastReplyAt}>
                        {new Date(lead.lastReplyAt).toLocaleString()}
                      </time>
                      {lead.lastReplyBody && (
                        <p className="mt-1 line-clamp-2 text-xs text-zinc-500">
                          {lead.lastReplyBody}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href="/agent/chat"
                        className="inline-flex rounded-lg border border-sky-300 px-3 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-50 dark:border-sky-800 dark:text-sky-200 dark:hover:bg-sky-950/40"
                      >
                        View chat
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-zinc-100 sm:hidden dark:divide-zinc-800">
            {leads.map((lead) => (
              <li key={lead.id} className="space-y-2 px-4 py-4">
                <p className="font-medium">{lead.businessName}</p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{lead.phone}</p>
                {lead.industry && (
                  <p className="text-xs text-zinc-500">Industry: {lead.industry}</p>
                )}
                <Link
                  href="/agent/chat"
                  className="inline-block text-xs font-medium text-sky-700 dark:text-sky-300"
                >
                  View chat →
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
