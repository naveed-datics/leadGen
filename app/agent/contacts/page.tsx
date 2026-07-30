"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Contact = {
  id: string;
  leadId: string | null;
  customerPhone: string;
  displayName: string;
  industry: string | null;
  lastMessageAt: string;
  lastMessageBody: string | null;
  lastMessageDirection: string | null;
  hasSent: boolean;
};

export default function AgentContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agent/chat/conversations?filter=contacts", {
        cache: "no-store",
      });
      const data = (await res.json()) as { conversations?: Contact[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load contacts");
      setContacts(data.conversations ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load contacts");
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadContacts();
    const intervalId = setInterval(() => void loadContacts(), 5000);
    return () => clearInterval(intervalId);
  }, [loadContacts]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6 sm:py-14">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Contacts
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Everyone you have messaged on WhatsApp — business name, phone, and industry.
          </p>
        </div>
        <Link
          href="/agent/chat?start=1"
          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          New message
        </Link>
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
      ) : contacts.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No contacts yet. Send a proposal from an opportunity or start a chat to add one.
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
                    Last activity
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {contacts.map((contact) => (
                  <tr
                    key={contact.id}
                    className="hover:bg-zinc-50/80 dark:hover:bg-zinc-900/30"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-zinc-900 dark:text-zinc-50">
                          {contact.displayName}
                        </p>
                        {contact.hasSent && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
                            Sent
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                      {contact.customerPhone}
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                      {contact.industry ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                      <time dateTime={contact.lastMessageAt}>
                        {new Date(contact.lastMessageAt).toLocaleString()}
                      </time>
                      {contact.lastMessageBody && (
                        <p className="mt-1 line-clamp-1 text-xs text-zinc-500">
                          {contact.lastMessageDirection === "outbound" ? "You: " : ""}
                          {contact.lastMessageBody}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/agent/chat?conversation=${contact.id}`}
                        className="inline-flex whitespace-nowrap rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-200 dark:hover:bg-emerald-950/40"
                      >
                        Open chat
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-zinc-100 sm:hidden dark:divide-zinc-800">
            {contacts.map((contact) => (
              <li key={contact.id} className="space-y-2 px-4 py-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{contact.displayName}</p>
                  {contact.hasSent && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                      Sent
                    </span>
                  )}
                </div>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {contact.customerPhone}
                </p>
                {contact.industry && (
                  <p className="text-xs text-zinc-500">Industry: {contact.industry}</p>
                )}
                <Link
                  href={`/agent/chat?conversation=${contact.id}`}
                  className="inline-block whitespace-nowrap text-xs font-medium text-emerald-700 dark:text-emerald-300"
                >
                  Open chat →
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
