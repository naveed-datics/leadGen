"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { LeadGenLogo } from "@/components/LeadGenLogo";

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

export function Nav({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
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

  const navItems = useMemo(() => {
    const items: Array<{
      label: string;
      href: string;
      show: boolean;
    }> = [
      { label: "Dashboard", href: "/dashboard", show: true },
      { label: "Chat", href: "/agent/chat", show: role === "agent" },
      { label: "Contacts", href: "/agent/contacts", show: role === "agent" },
      { label: "Saved Searches", href: "/searches", show: true },
      { label: "Industries", href: "/agent/industries", show: role === "agent" },
      { label: "Demos", href: "/demos", show: true },
      { label: "Leads", href: "/leads", show: true },
      { label: "Settings", href: "/agent/settings", show: role === "agent" },
      { label: "Agents", href: "/admin/agents", show: role === "admin" },
    ];
    return items.filter((i) => i.show);
  }, [role]);

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    if (href === "/agent/chat") return pathname === "/agent/chat";
    if (href === "/agent/contacts") return pathname === "/agent/contacts";
    if (href === "/searches") return pathname === "/searches" || pathname.startsWith("/searches/");
    if (href === "/agent/industries") {
      return pathname === "/agent/industries" || pathname.startsWith("/agent/industries/");
    }
    if (href === "/demos") return pathname === "/demos" || pathname.startsWith("/demos/");
    if (href === "/leads") return pathname === "/leads";
    if (href === "/agent/settings") return pathname === "/agent/settings";
    if (href === "/admin/agents") return pathname === "/admin/agents";
    return pathname === href;
  }

  const welcomeLabel = role === "admin" ? "Welcome Admin" : role === "agent" ? "Welcome Agent" : "";
  const displayName = name?.trim() ? name.trim() : "—";
  const displayRegion =
    role === "admin" ? "Global" : role === "agent" ? (region?.trim() ? region.trim() : "—") : "—";

  // Keep /login (and any logged-out state) clean: render page without shell.
  if (!role) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen w-full bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <aside className="hidden w-72 shrink-0 border-r border-white/10 bg-gradient-to-b from-zinc-950 to-zinc-900 text-zinc-100 dark:from-zinc-950 dark:to-zinc-950/90 md:block">
        <div className="flex h-full flex-col p-5">
          <Link href="/dashboard" className="inline-flex items-center gap-3 rounded-xl p-2 hover:bg-white/5">
            <LeadGenLogo />
          </Link>

          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs font-semibold tracking-wide text-white/80">{welcomeLabel}</div>
            <div className="mt-1 text-sm font-semibold text-white">{displayName}</div>
            <div className="mt-1 text-xs text-white/70">{displayRegion}</div>
          </div>

          <nav className="mt-6 flex flex-col gap-1">
            {navItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "group flex items-center justify-between rounded-xl px-3 py-2 text-sm transition",
                    active ? "bg-emerald-500/15 text-emerald-200" : "text-white/85 hover:bg-white/5 hover:text-white",
                  ].join(" ")}
                >
                  <span className="font-medium">{item.label}</span>
                  <span
                    className={[
                      "h-1.5 w-1.5 rounded-full transition",
                      active ? "bg-emerald-300" : "bg-transparent group-hover:bg-white/40",
                    ].join(" ")}
                  />
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto pt-6">
            <div className="text-xs text-white/50">LeadGen</div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-end border-b border-zinc-200 bg-white/75 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/65">
          <button
            onClick={() => void logout()}
            className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Logout
          </button>
        </header>

        <div className="flex-1">
          {loading ? (
            <div className="opacity-90">{children}</div>
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
}
