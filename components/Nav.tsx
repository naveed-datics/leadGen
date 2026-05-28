"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type MeResponse =
  | {
      user: {
        role: "admin" | "agent";
        name: string;
        email: string;
        region: string | null;
      };
    }
  | { error: string };

export function Nav() {
  const [role, setRole] = useState<"admin" | "agent" | null>(null);
  const [name, setName] = useState<string>("");
  const [region, setRegion] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const data = (await res.json()) as MeResponse;
        if (cancelled) return;
        if (!res.ok || "error" in data) {
          setRole(null);
          setName("");
          setRegion(null);
          return;
        }
        setRole(data.user.role);
        setName(data.user.name);
        setRegion(data.user.region ?? null);
      } catch {
        if (!cancelled) {
          setRole(null);
          setName("");
          setRegion(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  // Hide the entire top menu when logged out (e.g. on /login).
  if (loading || !role) return null;

  return (
    <nav className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-4 py-3 sm:px-6">
        <Link
          href={role === "admin" ? "/admin/agents" : "/"}
          className="text-sm font-semibold text-emerald-600 dark:text-emerald-400"
        >
          LeadGen
        </Link>

        <div className="flex items-center gap-6">
          <div className="hidden text-xs text-zinc-600 dark:text-zinc-400 sm:block">
            {role === "agent"
              ? `Agent: ${name || "—"}${region ? ` - ${region}` : ""}`
              : `Admin: ${name || "—"}`}
          </div>
          {role === "agent" ? (
            <>
              <Link
                href="/"
                className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Search
              </Link>
              <Link
                href="/agent/chat"
                className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Chat
              </Link>
              <Link
                href="/searches"
                className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                History
              </Link>
              <Link
                href="/agent/settings"
                className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Settings
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/searches"
                className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Searches
              </Link>
              <Link
                href="/admin/agents"
                className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Agents
              </Link>
              <Link
                href="/admin/logs"
                className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Logs
              </Link>
            </>
          )}

          <button
            onClick={() => void logout()}
            className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
}
