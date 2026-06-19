"use client";

import { useEffect, useState } from "react";
import { buildProposalTemplate } from "@/lib/proposal-template";
import type { CompetitorWithStats, ProposalSummary } from "@/lib/types";

type ModalMode = "create" | "edit" | "view";

type MeResponse =
  | {
      user: {
        name: string;
      };
    }
  | { error: string };

interface ProposalModalProps {
  open: boolean;
  mode: ModalMode;
  leadId: string;
  businessName: string;
  industry: string;
  location: string;
  leadPhone: string | null;
  hasWhatsapp: boolean | null;
  whatsappConfigured: boolean;
  initialBody: string;
  proposal: ProposalSummary | null;
  saving: boolean;
  onClose: () => void;
  onSave: (body: string) => Promise<ProposalSummary>;
  onSendWhatsApp: (body: string) => Promise<void>;
}

export function ProposalModal({
  open,
  mode,
  leadId,
  businessName,
  industry,
  location,
  leadPhone,
  hasWhatsapp,
  whatsappConfigured,
  initialBody,
  proposal,
  saving,
  onClose,
  onSave,
  onSendWhatsApp,
}: ProposalModalProps) {
  const [body, setBody] = useState(initialBody);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [senderName, setSenderName] = useState("");
  const [autoSavingDraft, setAutoSavingDraft] = useState(false);
  const [autoSavedDraft, setAutoSavedDraft] = useState(false);
  const readOnly = mode === "view";

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json()) as MeResponse;
        if (cancelled) return;
        if (!res.ok || "error" in data) return;
        setSenderName(data.user.name ?? "");
      })
      .catch(() => {
        if (!cancelled) setSenderName("");
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    if (proposal?.body) {
      setBody(proposal.body);
      setTemplateLoading(false);
      setAutoSavedDraft(true);
      return;
    }

    if (mode !== "create") {
      setBody(initialBody);
      setTemplateLoading(false);
      return;
    }

    let cancelled = false;
    setTemplateLoading(true);
    setBody("");
    setAutoSavedDraft(false);

    fetch(`/api/leads/${leadId}/competitors?includeStats=true&refreshStats=true`)
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;

        let competitors: CompetitorWithStats[] = [];
        if (res.ok) {
          competitors = data.competitors ?? [];
        }

        setBody(
          buildProposalTemplate({
            businessName,
            industry,
            location,
            competitors,
            senderName,
          }),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setBody(
            buildProposalTemplate({
              businessName,
              industry,
              location,
              competitors: [],
              senderName,
            }),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setTemplateLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    open,
    mode,
    leadId,
    proposal,
    businessName,
    industry,
    location,
    initialBody,
    senderName,
  ]);

  useEffect(() => {
    if (!open) return;
    if (mode !== "create") return;
    if (templateLoading) return;
    if (readOnly) return;
    if (autoSavedDraft) return;
    if (!body.trim()) return;

    let cancelled = false;
    setAutoSavingDraft(true);
    onSave(body)
      .then(() => {
        if (!cancelled) setAutoSavedDraft(true);
      })
      .catch(() => {
        // ignore: user can still manually save
      })
      .finally(() => {
        if (!cancelled) setAutoSavingDraft(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, mode, templateLoading, readOnly, autoSavedDraft, body, onSave]);

  if (!open) return null;

  const canSend =
    whatsappConfigured &&
    Boolean(leadPhone?.trim()) &&
    hasWhatsapp !== false &&
    Boolean(body.trim()) &&
    !readOnly &&
    !templateLoading &&
    !autoSavingDraft;

  const sendDisabledReason = templateLoading
    ? "Loading competitor data for your proposal…"
    : autoSavingDraft
      ? "Saving (In progress)…"
    : !whatsappConfigured
      ? "Set WAHA_BASE_URL and WAHA_SESSION in .env.local and pair your WhatsApp session in WAHA"
      : !leadPhone?.trim()
        ? "This lead has no phone number"
        : hasWhatsapp === false
          ? "This number is not on WhatsApp"
          : !body.trim()
            ? "Write a message before sending"
            : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="proposal-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-label="Close"
      />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        <h2
          id="proposal-title"
          className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
        >
          {readOnly ? "Proposal" : mode === "create" ? "Create proposal" : "Edit proposal"}
        </h2>
        <p className="mt-1 text-sm text-zinc-500">{businessName}</p>

        {mode === "create" && templateLoading && (
          <p className="mt-2 text-xs text-zinc-500">
            Finding nearby competitors with websites…
          </p>
        )}

        {readOnly && proposal?.sentAt && (
          <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
            Sent via WhatsApp{" "}
            {new Date(proposal.sentAt).toLocaleString("en-US", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        )}

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          readOnly={readOnly || templateLoading}
          rows={16}
          placeholder={templateLoading ? "Loading proposal…" : undefined}
          className="mt-4 w-full resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 read-only:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:read-only:bg-zinc-900"
        />

        {sendDisabledReason && !readOnly && (
          <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
            {sendDisabledReason}
          </p>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300"
          >
            Close
          </button>
          {!readOnly && (
            <>
              <button
                type="button"
                disabled={saving || !body.trim() || templateLoading}
                onClick={() => onSave(body)}
                className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-900 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                disabled={saving || !canSend}
                onClick={() => onSendWhatsApp(body)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                title={sendDisabledReason ?? "Send via WhatsApp"}
              >
                <WhatsAppIcon />
                {saving ? "Sending…" : "Send via WhatsApp"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function WhatsAppIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}
