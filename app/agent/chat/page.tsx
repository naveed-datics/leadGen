"use client";

import { useCallback, useEffect, useState } from "react";

type ListMode = "inbox" | "sent";

type Conversation = {
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

type Message = {
  id: string;
  direction: string;
  body: string;
  status: string;
  createdAt: string;
};

type LoadOptions = {
  silent?: boolean;
};

const POLL_MS = 3000;

export default function AgentChatPage() {
  const [listMode, setListMode] = useState<ListMode>("inbox");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [startOpen, setStartOpen] = useState(false);
  const [startBusinessName, setStartBusinessName] = useState("");
  const [startIndustry, setStartIndustry] = useState("");
  const [startPhone, setStartPhone] = useState("");
  const [startText, setStartText] = useState("");
  const [starting, setStarting] = useState(false);

  const loadConversations = useCallback(async (mode: ListMode, options?: LoadOptions) => {
    const silent = options?.silent ?? false;
    if (!silent) {
      setError(null);
      setSuccess(null);
      setLoading(true);
    }
    try {
      const res = await fetch(`/api/agent/chat/conversations?filter=${mode}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as { conversations?: Conversation[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load conversations");
      const list = data.conversations ?? [];
      setConversations(list);
      setActiveId((prev) => {
        if (prev && list.some((c) => c.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
    } catch (e) {
      if (!silent) {
        setError(e instanceof Error ? e.message : "Failed to load conversations");
        setConversations([]);
        setActiveId(null);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (conversationId: string, options?: LoadOptions) => {
    const silent = options?.silent ?? false;
    if (!silent) setError(null);
    try {
      const res = await fetch(
        `/api/agent/chat/conversations/${conversationId}/messages`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as { messages?: Message[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load messages");
      setMessages(data.messages ?? []);
    } catch (e) {
      if (!silent) {
        setError(e instanceof Error ? e.message : "Failed to load messages");
        setMessages([]);
      }
    }
  }, []);

  useEffect(() => {
    void loadConversations(listMode);
  }, [listMode, loadConversations]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("start") === "1") setStartOpen(true);
    const convId = params.get("conversation");
    if (convId) setActiveId(convId);
  }, []);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    void loadMessages(activeId);
  }, [activeId, loadMessages]);

  useEffect(() => {
    const tick = () => {
      void loadConversations(listMode, { silent: true });
      if (activeId) void loadMessages(activeId, { silent: true });
    };
    const intervalId = setInterval(tick, POLL_MS);
    return () => clearInterval(intervalId);
  }, [listMode, activeId, loadConversations, loadMessages]);

  async function startChat(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setStarting(true);
    try {
      const res = await fetch("/api/agent/chat/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: startPhone,
          text: startText,
          businessName: startBusinessName,
          industry: startIndustry,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; conversationId?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to start chat");
      setSuccess("Message sent.");
      setStartBusinessName("");
      setStartIndustry("");
      setStartPhone("");
      setStartText("");
      setStartOpen(false);
      setListMode("sent");
      await loadConversations("sent");
      if (data.conversationId) setActiveId(data.conversationId);
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Failed to start chat");
    } finally {
      setStarting(false);
    }
  }

  const activeConversation = conversations.find((c) => c.id === activeId) ?? null;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            WhatsApp chat
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Inbox for replies and sent messages awaiting a response.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setStartOpen((v) => !v)}
          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Start chat
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
        </div>
      )}

      {success && (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100">
          {success}
        </div>
      )}

      {startOpen && (
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Start chat
          </h2>
          <form onSubmit={startChat} className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-1">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Business name
              </span>
              <input
                value={startBusinessName}
                onChange={(e) => setStartBusinessName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                placeholder="e.g. Joe's Plumbing"
                required
              />
            </label>
            <label className="block sm:col-span-1">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Industry
              </span>
              <input
                value={startIndustry}
                onChange={(e) => setStartIndustry(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                placeholder="e.g. plumbers"
                required
              />
            </label>
            <label className="block sm:col-span-1">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Phone (WhatsApp)
              </span>
              <input
                value={startPhone}
                onChange={(e) => setStartPhone(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                placeholder="e.g. +9715xxxxxxx"
                required
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Message
              </span>
              <textarea
                value={startText}
                onChange={(e) => setStartText(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                placeholder="Type your message…"
                rows={3}
                required
              />
            </label>
            <div className="flex gap-2 sm:col-span-2">
              <button
                type="submit"
                disabled={starting}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {starting ? "Sending…" : "Send on WhatsApp"}
              </button>
              <button
                type="button"
                onClick={() => setStartOpen(false)}
                className="rounded-xl border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setListMode("inbox")}
          className={tabClass(listMode === "inbox")}
        >
          Inbox
        </button>
        <button
          type="button"
          onClick={() => setListMode("sent")}
          className={tabClass(listMode === "sent")}
        >
          Sent
        </button>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[300px_1fr]">
        <aside className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="border-b border-zinc-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
            {listMode === "inbox" ? "Replies received" : "Awaiting reply"}
          </div>
          <div className="max-h-[520px] overflow-auto">
            {loading ? (
              <div className="p-4 text-sm text-zinc-500">Loading…</div>
            ) : conversations.length === 0 ? (
              <div className="p-4 text-sm text-zinc-500">
                {listMode === "inbox"
                  ? "No replies from your contacts yet. Inbox only shows leads you messaged who replied."
                  : "No sent conversations yet. Send a proposal from a lead or use Start chat."}
              </div>
            ) : (
              conversations.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveId(c.id)}
                  className={`flex w-full flex-col gap-1 border-b border-zinc-100 p-3 text-left text-sm transition hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900 ${
                    activeId === c.id ? "bg-emerald-50/80 dark:bg-emerald-950/20" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 font-medium text-zinc-900 dark:text-zinc-50">
                      {c.displayName}
                    </div>
                    <time
                      className="shrink-0 text-[10px] text-zinc-500"
                      dateTime={c.lastMessageAt}
                    >
                      {formatRelativeTime(c.lastMessageAt)}
                    </time>
                  </div>
                  <div className="text-xs text-zinc-500">{c.customerPhone}</div>
                  {c.industry && (
                    <div className="text-xs text-zinc-600 dark:text-zinc-400">
                      {c.industry}
                    </div>
                  )}
                  {c.lastMessageBody && (
                    <p className="line-clamp-2 text-xs text-zinc-600 dark:text-zinc-400">
                      {c.lastMessageDirection === "outbound" ? "You: " : ""}
                      {c.lastMessageBody}
                    </p>
                  )}
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="flex min-h-[520px] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            {activeConversation ? (
              <>
                <div className="font-medium text-zinc-900 dark:text-zinc-50">
                  {activeConversation.displayName}
                </div>
                <div className="text-xs text-zinc-500">
                  {activeConversation.customerPhone}
                  {activeConversation.industry
                    ? ` · ${activeConversation.industry}`
                    : ""}
                  {activeConversation.leadId ? " · Linked to lead" : ""}
                </div>
              </>
            ) : (
              <div className="text-sm text-zinc-500">Select a contact or conversation</div>
            )}
          </div>
          <div className="flex-1 overflow-auto p-4">
            {!activeId ? (
              <div className="text-sm text-zinc-500">
                Choose a conversation from the {listMode} list.
              </div>
            ) : messages.length === 0 ? (
              <div className="text-sm text-zinc-500">No messages yet.</div>
            ) : (
              <div className="space-y-3">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${
                      m.direction === "outbound" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                        m.direction === "outbound"
                          ? "bg-emerald-600 text-white"
                          : "bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-50"
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{m.body}</div>
                      <div className="mt-1 text-[10px] opacity-70">
                        {new Date(m.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function tabClass(active: boolean): string {
  return [
    "rounded-xl border px-3 py-1.5 text-sm font-medium transition",
    active
      ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100"
      : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900",
  ].join(" ");
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString();
}
