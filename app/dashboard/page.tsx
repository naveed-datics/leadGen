"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useState } from "react";

type MeResponse =
  | {
      user: {
        role: "admin" | "agent";
        name: string;
        region: string | null;
      };
    }
  | { error: string };

type DashboardStatsResponse =
  | {
      stats: {
        totalLeads: number;
        proposalsInProgress: number;
        proposalsSent: number;
        proposalsReplied: number;
      };
    }
  | { error: string };

function CardIcon({
  variant,
}: {
  variant: "search" | "history" | "chat" | "settings" | "agents";
}) {
  const common =
    "h-10 w-10 rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/20 text-emerald-700 dark:text-emerald-300 grid place-items-center";
  const iconProps = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    className: "opacity-95",
    "aria-hidden": true,
  } as const;

  return (
    <div className={common}>
      {variant === "search" && (
        <svg {...iconProps}>
          <path
            d="M10.5 18.5a8 8 0 1 1 0-16a8 8 0 0 1 0 16Z"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M16.2 16.2L21 21"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      )}
      {variant === "history" && (
        <svg {...iconProps}>
          <path
            d="M12 8v5l3 2"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M4 12a8 8 0 1 0 2.3-5.7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M4 4v4h4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {variant === "chat" && (
        <svg {...iconProps}>
          <path
            d="M6.5 17.5l-2 3.5V6.5A3.5 3.5 0 0 1 8 3h8a3.5 3.5 0 0 1 3.5 3.5V14A3.5 3.5 0 0 1 16 17.5H6.5Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M8 8.5h8M8 12h6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      )}
      {variant === "settings" && (
        <svg {...iconProps}>
          <path
            d="M12 15.25a3.25 3.25 0 1 0 0-6.5a3.25 3.25 0 0 0 0 6.5Z"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M19.4 15.1l1.1-1.9l-1.9-3.3l-2.2.4a7.7 7.7 0 0 0-1.3-1.3l.4-2.2L12.2 4.5L10.3 5.6c-.5-.1-1-.1-1.6 0L6.8 4.5L3.5 6.8l.4 2.2c-.5.4-.9.8-1.3 1.3l-2.2-.4L-1.5 13.2l1.1 1.9c-.1.5-.1 1 0 1.6l-1.1 1.9l1.9 3.3l2.2-.4c.4.5.8.9 1.3 1.3l-.4 2.2l3.3 1.9l1.9-1.1c.5.1 1 .1 1.6 0l1.9 1.1l3.3-1.9l-.4-2.2c.5-.4.9-.8 1.3-1.3l2.2.4l1.9-3.3l-1.1-1.9c.1-.5.1-1 0-1.6Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {variant === "agents" && (
        <svg {...iconProps}>
          <path
            d="M16 11a4 4 0 1 0-8 0"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M5 21a7 7 0 0 1 14 0"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      )}
    </div>
  );
}

function ActionCard({
  href,
  title,
  description,
  icon,
}: {
  href: string;
  title: string;
  description: string;
  icon: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md motion-reduce:transform-none dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-emerald-800"
    >
      <div className="flex items-start gap-4">
        {icon}
        <div className="min-w-0">
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {title}
          </div>
          <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {description}
          </div>
        </div>
      </div>
      <div className="mt-4 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
        Open →
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const [role, setRole] = useState<"admin" | "agent" | null>(null);
  const [name, setName] = useState<string>("");
  const [region, setRegion] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    totalLeads: number;
    proposalsInProgress: number;
    proposalsSent: number;
    proposalsReplied: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const data = (await res.json()) as MeResponse;
        if (cancelled) return;
        if (!res.ok || "error" in data) return;
        setRole(data.user.role);
        setName(data.user.name ?? "");
        setRegion(data.user.region ?? null);
      } catch {
        // ignore
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard/stats", { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json()) as DashboardStatsResponse;
        if (cancelled) return;
        if (!res.ok || "error" in data) return;
        setStats(data.stats);
      })
      .catch(() => {
        if (!cancelled) setStats(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const title = useMemo(() => {
    if (!role) return "Dashboard";
    const who = role === "admin" ? "Admin" : "Agent";
    const where =
      role === "admin" ? "Global" : region?.trim() ? region.trim() : "Not assigned";
    return `${who} dashboard: ${where}`;
  }, [role, region]);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="w-full">
        <header className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            LeadGen
          </p>
          <h1 className="text-3xl font-bold tracking-[-0.035em] text-zinc-900 sm:text-4xl dark:text-zinc-50">
            {title}
          </h1>
          <p className="max-w-2xl text-zinc-600 dark:text-zinc-400">
            Quick access to your most common actions.
            {name?.trim() ? ` Welcome, ${name.trim()}.` : ""}
          </p>
        </header>

        {stats && (
          <section className="mt-6 grid w-full grid-cols-2 gap-3 lg:grid-cols-4">
            <Link
              href="/searches"
              className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md motion-reduce:transform-none dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-emerald-800"
            >
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Potential clients (leads)
              </div>
              <div className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                {stats.totalLeads}
              </div>
            </Link>
            <Link
              href="/proposals/in-progress"
              className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md motion-reduce:transform-none dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-emerald-800"
            >
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                In progress
              </div>
              <div className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                {stats.proposalsInProgress}
              </div>
            </Link>
            <Link
              href="/proposals/sent"
              className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md motion-reduce:transform-none dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-emerald-800"
            >
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Applied / submitted (sent)
              </div>
              <div className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                {stats.proposalsSent}
              </div>
            </Link>
            <Link
              href="/proposals/replied"
              className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md motion-reduce:transform-none dark:border-emerald-900/50 dark:bg-emerald-950/20"
            >
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                Needs follow-up (replied)
              </div>
              <div className="mt-1 text-2xl font-bold text-emerald-950 dark:text-emerald-100">
                {stats.proposalsReplied}
              </div>
            </Link>
          </section>
        )}

        <section className="mt-8 grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ActionCard
            href="/"
            title="Search"
            description="Run a new lead search."
            icon={<CardIcon variant="search" />}
          />
          <ActionCard
            href="/searches"
            title="Saved Searches"
            description="Search history and outreach prospects."
            icon={<CardIcon variant="history" />}
          />
          <ActionCard
            href="/leads"
            title="Leads"
            description="WhatsApp replies ready for follow-up."
            icon={<CardIcon variant="history" />}
          />

          {role === "admin" ? (
            <ActionCard
              href="/admin/agents"
              title="Agents"
              description="Manage agents and permissions."
              icon={<CardIcon variant="agents" />}
            />
          ) : (
            <>
              <ActionCard
                href="/agent/industries"
                title="Industries"
                description="Choose the industries you can search."
                icon={<CardIcon variant="search" />}
              />
              <ActionCard
                href="/agent/chat?start=1"
                title="Start chat now"
                description="Send a WhatsApp message to a lead."
                icon={<CardIcon variant="chat" />}
              />
              <ActionCard
                href="/agent/chat"
                title="Chat"
                description="Open your WhatsApp inbox."
                icon={<CardIcon variant="chat" />}
              />
              <ActionCard
                href="/agent/settings"
                title="Settings"
                description="Configure SerpApi and WhatsApp."
                icon={<CardIcon variant="settings" />}
              />
            </>
          )}
        </section>
      </div>
    </main>
  );
}

