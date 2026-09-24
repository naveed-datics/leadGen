export type ActionIconVariant = "view" | "search" | "edit" | "delete" | "verify";

export function ActionIcon({ variant }: { variant: ActionIconVariant }) {
  const iconProps = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": true,
  } as const;

  switch (variant) {
    case "view":
      return (
        <svg {...iconProps}>
          <path
            d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="12" r="2.75" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case "search":
      return (
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
      );
    case "edit":
      return (
        <svg {...iconProps}>
          <path
            d="M4 20h4L18.5 9.5a2.5 2.5 0 0 0-4-4L4 16v4Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M13.5 6.5l4 4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "delete":
      return (
        <svg {...iconProps}>
          <path
            d="M5 7h14M10 3.5h4M9.5 7v11m5-11v11M6.5 7l.7 12A2 2 0 0 0 9.2 20.5h5.6a2 2 0 0 0 2-1.9L18.5 7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "verify":
      return (
        <svg {...iconProps}>
          <path
            d="M12 3.5l7 3v5c0 4.5-3 7.5-7 8.5-4-1-7-4-7-8.5v-5l7-3Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M9 12.3l2 2 4-4.3"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    default:
      return null;
  }
}
