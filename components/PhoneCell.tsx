"use client";

import { buildWhatsAppUrl } from "@/lib/whatsapp";

interface PhoneCellProps {
  phone: string | null;
  hasWhatsapp: boolean | null | undefined;
  checking?: boolean;
}

export function PhoneCell({ phone, hasWhatsapp, checking }: PhoneCellProps) {
  if (!phone) {
    return <span className="text-zinc-400">—</span>;
  }

  const waUrl = buildWhatsAppUrl(phone);

  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      <StatusIcon
        hasWhatsapp={hasWhatsapp}
        checking={checking}
        waUrl={waUrl}
      />
      {hasWhatsapp && waUrl ? (
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-emerald-600 dark:hover:text-emerald-400"
        >
          {phone}
        </a>
      ) : (
        <span>{phone}</span>
      )}
    </div>
  );
}

function StatusIcon({
  hasWhatsapp,
  checking,
  waUrl,
}: {
  hasWhatsapp: boolean | null | undefined;
  checking?: boolean;
  waUrl: string | null;
}) {
  if (checking || hasWhatsapp === null || hasWhatsapp === undefined) {
    return (
      <span
        className="inline-flex h-5 w-5 items-center justify-center"
        title="Checking WhatsApp…"
      >
        <svg
          className="h-4 w-4 animate-spin text-zinc-400"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      </span>
    );
  }

  if (hasWhatsapp && waUrl) {
    return (
      <a
        href={waUrl}
        target="_blank"
        rel="noopener noreferrer"
        title="On WhatsApp — open chat"
        className="inline-flex shrink-0 text-[#25D366] hover:opacity-80"
      >
        <WhatsAppIcon />
      </a>
    );
  }

  return (
    <span
      className="inline-flex shrink-0 text-zinc-400"
      title="Not on WhatsApp"
    >
      <NoWhatsAppIcon />
    </span>
  );
}

function WhatsAppIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function NoWhatsAppIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
      />
      <path strokeLinecap="round" d="M4 4l16 16" />
    </svg>
  );
}
