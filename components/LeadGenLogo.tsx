export function LeadGenLogo() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-500/15 ring-1 ring-emerald-400/25">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          className="text-emerald-300"
        >
          <path
            d="M4.5 13.25C6.7 14.2 8.9 14.66 11.1 14.64C15.2 14.59 18.85 12.77 21 9.75"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M7 20.5C7.85 18.3 9.06 16.62 10.63 15.46C12.86 13.82 15.59 13.41 18.8 14.24"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M12 3.5V8.25"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="leading-tight">
        <div className="text-sm font-semibold text-white">LeadGen</div>
        <div className="text-xs text-white/60">Lead discovery</div>
      </div>
    </div>
  );
}

