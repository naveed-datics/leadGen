import { LeadGenLogo } from "@/components/LeadGenLogo";

const ERROR_MESSAGES: Record<string, string> = {
  credentials: "Invalid email or password.",
  invalid: "Please enter a valid email and password.",
  role: "This account cannot sign in.",
  inactive: "This account is inactive. Contact an admin.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const errorMessage = error ? ERROR_MESSAGES[error] ?? "Unable to sign in. Try again." : null;

  return (
    <main className="grid min-h-[100dvh] bg-zinc-50 dark:bg-zinc-950 lg:grid-cols-[minmax(20rem,0.8fr)_1.2fr]">
      <section className="relative hidden overflow-hidden bg-zinc-950 p-10 text-white lg:flex lg:flex-col">
        <LeadGenLogo />
        <div className="my-auto max-w-md">
          <p className="text-sm font-semibold text-emerald-300">Lead discovery workspace</p>
          <p className="mt-4 text-4xl font-bold tracking-[-0.04em]">
            Find prospects. Build demos. Start conversations.
          </p>
          <p className="mt-5 max-w-sm text-sm leading-6 text-white/60">
            One focused workspace for local lead research and WhatsApp outreach.
          </p>
        </div>
        <p className="text-xs text-white/35">LeadGen</p>
      </section>

      <section className="flex items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-10 lg:hidden">
            <p className="text-xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
              LeadGen
            </p>
            <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-400">
              Lead discovery workspace
            </p>
          </div>

          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            Welcome back
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-0.035em] text-zinc-950 dark:text-zinc-50">
            Sign in to your account
          </h1>
          <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Continue to your leads, demos, and conversations.
          </p>

          <form className="mt-8 space-y-5" method="post" action="/api/auth/login">
            {next && <input type="hidden" name="next" value={next} />}
            {errorMessage && (
              <p
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
              >
                {errorMessage}
              </p>
            )}
            <label className="block">
              <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                Email
              </span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-3 text-sm text-zinc-950 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                placeholder="you@company.com"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                Password
              </span>
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-3 text-sm text-zinc-950 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                placeholder="Enter your password"
              />
            </label>
            <button
              type="submit"
              className="w-full rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 active:scale-[0.99]"
            >
              Sign in
            </button>
          </form>
          <p className="mt-5 text-xs leading-5 text-zinc-500 dark:text-zinc-500">
            Access is limited to active LeadGen accounts.
          </p>
        </div>
      </section>
    </main>
  );
}

