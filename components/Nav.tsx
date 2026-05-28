import Link from "next/link";

export function Nav() {
  return (
    <nav className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="text-sm font-semibold text-emerald-600 dark:text-emerald-400"
        >
          LeadGen
        </Link>
        <Link
          href="/"
          className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Search
        </Link>
        <Link
          href="/searches"
          className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          History
        </Link>
      </div>
    </nav>
  );
}
