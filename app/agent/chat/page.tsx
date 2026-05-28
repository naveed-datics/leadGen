"use client";

import { useEffect, useState } from "react";

type Conversation = {
  id: string;
  leadId: string | null;
  customerPhone: string;
  displayName: string;
  lastMessageAt: string;
};

type Message = {
  id: string;
  direction: string;
  body: string;
  status: string;
  createdAt: string;
};

export default function AgentChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [startOpen, setStartOpen] = useState(false);
  const [startPhone, setStartPhone] = useState("");
  const [startText, setStartText] = useState("");
  const [startMode, setStartMode] = useState<"text" | "template">("text");
  const [templateName, setTemplateName] = useState("");
  const [templateLanguage, setTemplateLanguage] = useState("en_US");
  const [templateParamsJson, setTemplateParamsJson] = useState(
    "[]",
  );
  const [starting, setStarting] = useState(false);

  async function loadConversations() {
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const res = await fetch("/api/agent/chat/conversations", { cache: "no-store" });
      const data = (await res.json()) as { conversations?: Conversation[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load conversations");
      const list = data.conversations ?? [];
      setConversations(list);
      if (!activeId && list.length > 0) setActiveId(list[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load conversations");
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages(conversationId: string) {
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(
        `/api/agent/chat/conversations/${conversationId}/messages`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as { messages?: Message[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load messages");
      setMessages(data.messages ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load messages");
    }
  }

  useEffect(() => {
    void loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeId) return;
    void loadMessages(activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  async function startChat(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setStarting(true);
    try {
      let templateParams: unknown = undefined;
      if (startMode === "template") {
        try {
          templateParams = JSON.parse(templateParamsJson || "[]");
        } catch {
          throw new Error("Template params must be valid JSON (array).");
        }
      }

      const res = await fetch("/api/agent/chat/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: startPhone,
          mode: startMode,
          text: startMode === "text" ? startText : undefined,
          templateName: startMode === "template" ? templateName : undefined,
          templateLanguage: startMode === "template" ? templateLanguage : undefined,
          templateParams: startMode === "template" ? templateParams : undefined,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; conversationId?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to start chat");
      setSuccess("Message sent.");
      setStartPhone("");
      setStartText("");
      setTemplateName("");
      setStartOpen(false);
      await loadConversations();
      if (data.conversationId) setActiveId(data.conversationId);
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Failed to start chat");
    } finally {
      setStarting(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Chat
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            WhatsApp conversations (inbox).
          </p>
        </div>
        <button
          onClick={() => setStartOpen((v) => !v)}
          className="rounded-md bg-black px-4 py-2 text-sm text-white"
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
        <div className="mt-6 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Start chat
          </h2>
          <form onSubmit={startChat} className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-1">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Phone (WhatsApp)
              </span>
              <input
                value={startPhone}
                onChange={(e) => setStartPhone(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                placeholder="e.g. +9715xxxxxxx"
                required
              />
            </label>
            <label className="block sm:col-span-1">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Mode
              </span>
              <select
                value={startMode}
                onChange={(e) =>
                  setStartMode(e.target.value as "text" | "template")
                }
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="text">Text</option>
                <option value="template">Template</option>
              </select>
            </label>

            {startMode === "text" ? (
              <label className="block sm:col-span-2">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Message
                </span>
                <textarea
                  value={startText}
                  onChange={(e) => setStartText(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="Type your message…"
                  rows={3}
                  required
                />
              </label>
            ) : (
              <>
                <label className="block sm:col-span-1">
                  <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Template name
                  </span>
                  <input
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                    placeholder="e.g. jaspers_market_order_confirmation_v1"
                    required
                  />
                </label>
                <label className="block sm:col-span-1">
                  <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Language
                  </span>
                  <input
                    value={templateLanguage}
                    onChange={(e) => setTemplateLanguage(e.target.value)}
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                    placeholder="en_US"
                    required
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Body parameters (JSON array, optional)
                  </span>
                  <textarea
                    value={templateParamsJson}
                    onChange={(e) => setTemplateParamsJson(e.target.value)}
                    className="mt-1 w-full rounded-md border px-3 py-2 font-mono text-xs"
                    rows={4}
                    placeholder='[]'
                  />
                </label>
              </>
            )}
            <div className="sm:col-span-2 flex gap-2">
              <button
                type="submit"
                disabled={starting}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white disabled:opacity-60"
              >
                {starting ? "Sending…" : "Send on WhatsApp"}
              </button>
              <button
                type="button"
                onClick={() => setStartOpen(false)}
                className="rounded-md border px-4 py-2 text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
          <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
            Note: With Meta test numbers, you can only message allowed test recipients.
          </p>
        </div>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-[280px_1fr]">
        <aside className="rounded-xl border border-zinc-200 dark:border-zinc-800">
          <div className="border-b border-zinc-200 p-3 text-sm font-medium dark:border-zinc-800">
            Conversations
          </div>
          <div className="max-h-[520px] overflow-auto">
            {loading ? (
              <div className="p-3 text-sm text-zinc-500">Loading…</div>
            ) : conversations.length === 0 ? (
              <div className="p-3 text-sm text-zinc-500">
                No conversations yet. Send a WhatsApp message from a lead to start.
              </div>
            ) : (
              conversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveId(c.id)}
                  className={`flex w-full flex-col gap-0.5 border-b border-zinc-200 p-3 text-left text-sm dark:border-zinc-800 ${
                    activeId === c.id ? "bg-zinc-50 dark:bg-zinc-950" : ""
                  }`}
                >
                  <div className="font-medium text-zinc-900 dark:text-zinc-50">
                    {c.displayName}
                  </div>
                  <div className="text-xs text-zinc-600 dark:text-zinc-400">
                    {c.customerPhone}
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="rounded-xl border border-zinc-200 dark:border-zinc-800">
          <div className="border-b border-zinc-200 p-3 text-sm font-medium dark:border-zinc-800">
            Messages
          </div>
          <div className="max-h-[520px] overflow-auto p-3">
            {activeId && messages.length === 0 ? (
              <div className="text-sm text-zinc-500">No messages yet.</div>
            ) : (
              <div className="space-y-2">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${
                      m.direction === "outbound" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
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

