"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildProposalTemplate,
  injectDemoUrl,
} from "@/lib/proposal-template";
import type { CompetitorWithStats, ProposalSummary } from "@/lib/types";

type ModalMode = "create" | "edit" | "view";

type MeResponse =
  | {
      user: {
        name: string;
      };
    }
  | { error: string };

type SearchSettingsResponse = {
  demoEnabled: boolean;
  wpConfigured: boolean;
  effectiveDemoPageId: number | null;
  effectiveTemplate?: string;
  template?: string | null;
};

interface ProposalModalProps {
  open: boolean;
  mode: ModalMode;
  searchId: string;
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
  onSendWhatsApp: (body: string, testPhone?: string) => Promise<void>;
  onDemoCreated?: (proposal: ProposalSummary) => void;
}

export function ProposalModal({
  open,
  mode,
  searchId,
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
  onDemoCreated,
}: ProposalModalProps) {
  const [body, setBody] = useState(initialBody);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [senderName, setSenderName] = useState("");
  const [searchSettings, setSearchSettings] =
    useState<SearchSettingsResponse | null>(null);
  const [demoUrl, setDemoUrl] = useState<string | null>(
    proposal?.demoUrl ?? null,
  );
  const [demoCreating, setDemoCreating] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);
  const autoDemoAttempted = useRef(false);
  const autoSaveInFlight = useRef(false);
  const autoSaveRequestId = useRef(0);
  const onSaveRef = useRef(onSave);
  const [autoSavingDraft, setAutoSavingDraft] = useState(false);
  const [autoSavedDraft, setAutoSavedDraft] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const readOnly = mode === "view";

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    autoSaveRequestId.current += 1;
    autoSaveInFlight.current = false;
    setAutoSavingDraft(false);
    setAutoSavedDraft(false);
  }, [open, leadId]);

  useEffect(() => {
    if (!open) {
      autoDemoAttempted.current = false;
      return;
    }
    setDemoUrl(proposal?.demoUrl ?? null);
    setDemoError(null);
  }, [open, proposal?.demoUrl]);

  const handleCreateDemo = useCallback(async () => {
    setDemoCreating(true);
    setDemoError(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/demo`, { method: "POST" });
      const data = (await res.json()) as {
        demoUrl?: string;
        proposal?: ProposalSummary;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to create demo");

      const nextDemoUrl = data.demoUrl ?? null;
      setDemoUrl(nextDemoUrl);
      if (nextDemoUrl) {
        setBody((prev) => injectDemoUrl(prev, nextDemoUrl));
      }
      if (data.proposal) {
        onDemoCreated?.(data.proposal);
        setAutoSavedDraft(false);
      }
      return nextDemoUrl;
    } catch (e) {
      setDemoError(e instanceof Error ? e.message : "Failed to create demo");
      return null;
    } finally {
      setDemoCreating(false);
    }
  }, [leadId, onDemoCreated]);

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

    let cancelled = false;
    fetch(`/api/searches/${searchId}/settings/proposal-template`, {
      cache: "no-store",
    })
      .then(async (res) => {
        const data = (await res.json()) as SearchSettingsResponse & {
          error?: string;
        };
        if (cancelled) return;
        if (res.ok) setSearchSettings(data);
      })
      .catch(() => {
        if (!cancelled) setSearchSettings(null);
      });

    return () => {
      cancelled = true;
    };
  }, [open, searchId]);

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

    Promise.all([
      fetch(`/api/leads/${leadId}/competitors?includeStats=true&refreshStats=true`),
      fetch(`/api/searches/${searchId}/settings/proposal-template`, {
        cache: "no-store",
      }),
    ])
      .then(async ([competitorsRes, templateRes]) => {
        const competitorsData = await competitorsRes.json();
        const templateData = templateRes.ok
          ? ((await templateRes.json()) as SearchSettingsResponse)
          : null;

        if (cancelled) return;

        if (templateData) {
          setSearchSettings(templateData);
        }

        let competitors: CompetitorWithStats[] = [];
        if (competitorsRes.ok) {
          competitors = competitorsData.competitors ?? [];
        }

        const template =
          templateData?.effectiveTemplate ?? templateData?.template ?? null;

        setBody(
          buildProposalTemplate({
            businessName,
            industry,
            location,
            competitors,
            senderName,
            demoUrl: proposal?.demoUrl ?? undefined,
            customTemplate: template,
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
              demoUrl: proposal?.demoUrl ?? undefined,
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
    searchId,
    proposal,
    businessName,
    industry,
    location,
    initialBody,
    senderName,
    proposal?.demoUrl,
  ]);

  useEffect(() => {
    if (!open) return;
    if (mode !== "create") return;
    if (templateLoading || demoCreating) return;
    if (proposal?.demoUrl || demoUrl) return;
    if (!searchSettings?.demoEnabled) return;
    if (autoDemoAttempted.current) return;

    autoDemoAttempted.current = true;
    void handleCreateDemo();
  }, [
    open,
    mode,
    templateLoading,
    demoCreating,
    proposal?.demoUrl,
    demoUrl,
    searchSettings,
    handleCreateDemo,
  ]);

  useEffect(() => {
    if (!open) return;
    if (mode !== "create") return;
    if (templateLoading) return;
    if (demoCreating) return;
    if (readOnly) return;
    if (autoSavedDraft) return;
    if (!body.trim()) return;
    if (autoSaveInFlight.current) return;

    const timeoutId = window.setTimeout(() => {
      if (autoSaveInFlight.current) return;

      const requestId = ++autoSaveRequestId.current;
      autoSaveInFlight.current = true;
      setAutoSavingDraft(true);
      onSaveRef.current(body)
        .then(() => {
          if (autoSaveRequestId.current === requestId) {
            setAutoSavedDraft(true);
          }
        })
        .catch(() => {
          // ignore: user can still manually save
        })
        .finally(() => {
          if (autoSaveRequestId.current === requestId) {
            autoSaveInFlight.current = false;
            setAutoSavingDraft(false);
          }
        });
    }, 400);

    return () => window.clearTimeout(timeoutId);
  }, [
    open,
    mode,
    templateLoading,
    demoCreating,
    readOnly,
    autoSavedDraft,
    body,
  ]);

  if (!open) return null;

  const canCreateDemo =
    !readOnly && Boolean(searchSettings?.demoEnabled) && !demoCreating;

  const demoDisabledReason = null;

  const canSend =
    whatsappConfigured &&
    (testMode ? testPhone.trim().length >= 8 : Boolean(leadPhone?.trim()) && hasWhatsapp !== false) &&
    Boolean(body.trim()) &&
    !readOnly &&
    !templateLoading &&
    !autoSavingDraft &&
    !demoCreating;

  const sendDisabledReason = templateLoading
    ? "Loading competitor data for your proposal…"
    : autoSavingDraft
      ? "Saving (In progress)…"
      : demoCreating
        ? "Creating demo site…"
        : !whatsappConfigured
          ? "Set WAHA_BASE_URL and WAHA_SESSION in .env.local and pair your WhatsApp session in WAHA"
          : testMode
            ? testPhone.trim().length < 8
              ? "Enter a valid test WhatsApp number"
              : !body.trim()
                ? "Write a message before sending"
                : null
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
        tabIndex={-1}
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-label="Close proposal dialog"
      />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        <h2
          id="proposal-title"
          className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
        >
          {readOnly ? "Proposal" : mode === "create" ? "Create proposal" : "Edit proposal"}
        </h2>
        <p className="mt-1 text-sm text-zinc-500">{businessName}</p>

        {mode === "create" && (templateLoading || demoCreating) && (
          <p role="status" className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-emerald-500 motion-reduce:hidden" />
            {templateLoading
              ? "Preparing proposal (1 of 2)..."
              : "Building demo website (2 of 2)..."}
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

        {demoUrl && (
          <p className="mt-2 text-xs">
            Demo site:{" "}
            <a
              href={demoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-emerald-600 hover:underline dark:text-emerald-400"
            >
              {demoUrl}
            </a>
          </p>
        )}

        <textarea
          aria-label="Proposal message"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          readOnly={readOnly || templateLoading}
          rows={16}
          placeholder={templateLoading ? "Loading proposal…" : undefined}
          className="mt-4 w-full resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 read-only:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:read-only:bg-zinc-900"
        />

        {demoError && (
          <p role="alert" className="mt-3 text-xs text-red-600 dark:text-red-400">
            {demoError}
          </p>
        )}

        {sendDisabledReason && !readOnly && (
          <p role="status" className="mt-3 text-xs text-amber-700 dark:text-amber-300">
            {sendDisabledReason}
          </p>
        )}

        {!readOnly && (
          <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-950/50">
            <label className="flex items-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={testMode}
                onChange={(e) => setTestMode(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-zinc-300"
              />
              Test mode: send to a custom WhatsApp number instead of the client
            </label>
            {testMode && (
              <input
                type="tel"
                aria-label="Test WhatsApp number"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="e.g. +1 555 123 4567"
                className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            )}
          </div>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300"
          >
            Close
          </button>
          {!readOnly && searchSettings?.demoEnabled && (
            <button
              type="button"
              disabled={!canCreateDemo}
              onClick={() => void handleCreateDemo()}
              title={demoDisabledReason ?? (demoUrl ? "Recreate demo site" : "Create demo site")}
              className="rounded-lg border border-sky-300 px-4 py-2 text-sm font-medium text-sky-800 hover:bg-sky-50 disabled:opacity-60 dark:border-sky-700 dark:text-sky-200"
            >
              {demoCreating
                ? "Creating demo…"
                : demoUrl
                  ? "Recreate demo"
                  : "Create demo"}
            </button>
          )}
          {!readOnly && (
            <>
              <button
                type="button"
                disabled={saving || !body.trim() || templateLoading || demoCreating}
                onClick={() => onSave(body)}
                className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-900 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                disabled={saving || !canSend}
                onClick={() => onSendWhatsApp(body, testMode ? testPhone.trim() : undefined)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                title={sendDisabledReason ?? (testMode ? "Send test message" : "Send via WhatsApp")}
              >
                <WhatsAppIcon />
                {saving ? "Sending…" : testMode ? "Send test message" : "Send via WhatsApp"}
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
