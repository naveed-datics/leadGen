export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center p-6">
      <h1 className="text-2xl font-semibold">Login</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Sign in to continue.
      </p>
      <form className="mt-6 space-y-4" method="post" action="/api/auth/login">
        <label className="block">
          <span className="text-sm font-medium">Email</span>
          <input
            name="email"
            type="email"
            required
            className="mt-1 w-full rounded-md border px-3 py-2"
            placeholder="you@company.com"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Password</span>
          <input
            name="password"
            type="password"
            required
            className="mt-1 w-full rounded-md border px-3 py-2"
            placeholder="••••••••"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-md bg-black px-4 py-2 text-white"
        >
          Sign in
        </button>
      </form>
      <p className="mt-4 text-xs text-neutral-500">
        If your account is inactive, login will be denied.
      </p>
    </main>
  );
}

