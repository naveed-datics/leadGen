"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
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

type NavItem = {
  label: string;
  href: string;
  show: boolean;
};

export function Nav({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [role, setRole] = useState<"admin" | "agent" | null>(null);
  const [name, setName] = useState<string>("");
  const [region, setRegion] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

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

  useEffect(() => {
    if (!mobileOpen) return;

    const drawer = drawerRef.current;
    const focusable = drawer?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable?.[0];
    const last = focusable?.[focusable.length - 1];
    const menuButton = menuButtonRef.current;
    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    first?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileOpen(false);
        return;
      }
      if (event.key !== "Tab" || !first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      menuButton?.focus();
    };
  }, [mobileOpen]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const navItems = useMemo(() => {
    const items: NavItem[] = [
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
  const displayName = name?.trim() ? name.trim() : "Account";
  const displayRegion =
    role === "admin"
      ? "Global"
      : role === "agent"
        ? region?.trim()
          ? region.trim()
          : "Region not assigned"
        : "Region not assigned";

  // Keep /login (and any logged-out state) clean: render page without shell.
  if (!role) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-[100dvh] w-full bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <a
        href="#main-content"
        className="skip-link sr-only fixed left-4 top-4 z-50 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white focus:not-sr-only"
      >
        Skip to content
      </a>

      <aside
        aria-label="Application sidebar"
        className="hidden w-72 shrink-0 border-r border-white/10 bg-gradient-to-b from-zinc-950 to-zinc-900 text-zinc-100 md:block"
      >
        <SidebarContent
          navItems={navItems}
          isActive={isActive}
          welcomeLabel={welcomeLabel}
          displayName={displayName}
          displayRegion={displayRegion}
        />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close navigation menu"
            tabIndex={-1}
            className="absolute inset-0 bg-zinc-950/55 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            id="mobile-navigation"
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Mobile navigation"
            className="relative h-full w-[min(19rem,88vw)] border-r border-white/10 bg-zinc-950 text-zinc-100 shadow-2xl"
          >
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-4 top-4 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10 hover:text-white"
            >
              Close
            </button>
            <SidebarContent
              navItems={navItems}
              isActive={isActive}
              welcomeLabel={welcomeLabel}
              displayName={displayName}
              displayRegion={displayRegion}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      )}

      <div
        inert={mobileOpen ? true : undefined}
        className="flex min-w-0 flex-1 flex-col"
      >
        <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between border-b border-zinc-200/80 bg-white/85 px-4 backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-950/80 sm:px-6">
          <div className="flex items-center gap-3 md:hidden">
            <button
              type="button"
              ref={menuButtonRef}
              aria-expanded={mobileOpen}
              aria-controls="mobile-navigation"
              aria-haspopup="dialog"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              Menu
            </button>
            <span className="text-sm font-bold tracking-tight">LeadGen</span>
          </div>
          <div className="hidden text-sm text-zinc-500 md:block dark:text-zinc-400">
            {displayName}
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 active:scale-[0.98] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Logout
          </button>
        </header>

        <div id="main-content" className="flex-1" tabIndex={-1}>
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

function SidebarContent({
  navItems,
  isActive,
  welcomeLabel,
  displayName,
  displayRegion,
  onNavigate,
}: {
  navItems: NavItem[];
  isActive: (href: string) => boolean;
  welcomeLabel: string;
  displayName: string;
  displayRegion: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col p-5">
      <Link
        href="/dashboard"
        aria-label="LeadGen dashboard"
        onClick={onNavigate}
        className="inline-flex items-center gap-3 rounded-xl p-2 transition hover:bg-white/5"
      >
        <LeadGenLogo />
      </Link>

      <div className="mt-7 rounded-2xl border border-white/10 bg-white/[0.06] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-300/80">
          {welcomeLabel}
        </div>
        <div className="mt-2 text-sm font-semibold text-white">{displayName}</div>
        <div className="mt-1 text-xs text-white/55">{displayRegion}</div>
      </div>

      <nav aria-label="Main navigation" className="mt-7 flex flex-col gap-1">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
              className={[
                "group flex min-h-10 items-center justify-between rounded-xl px-3 py-2 text-sm transition",
                active
                  ? "bg-emerald-500/15 text-emerald-200 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.12)]"
                  : "text-white/70 hover:bg-white/[0.06] hover:text-white",
              ].join(" ")}
            >
              <span className="font-medium">{item.label}</span>
              <span
                aria-hidden="true"
                className={[
                  "h-1.5 w-1.5 rounded-full transition",
                  active ? "bg-emerald-300" : "bg-transparent",
                ].join(" ")}
              />
            </Link>
          );
        })}
      </nav>

      <p className="mt-auto pt-6 text-xs text-white/35">Lead discovery workspace</p>
    </div>
  );
}
