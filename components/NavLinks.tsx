import Link from "next/link";
import type { ReactNode } from "react";

export interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  description: string;
}

export function navItems(): NavItem[] {
  return [
    {
      href: "/dashboard",
      label: "Ringkasan",
      description: "Kondisi pasar dan sinyal teratas",
      icon: <IconGrid />,
    },
    {
      href: "/dashboard/sinyal",
      label: "Sinyal",
      description: "Screening rekomendasi beli dan jual",
      icon: <IconSignal />,
    },
    {
      href: "/dashboard/watchlist",
      label: "Watchlist",
      description: "Saham yang Anda pantau",
      icon: <IconStar />,
    },
    {
      href: "/dashboard/profil",
      label: "Pengaturan",
      description: "Akun dan preferensi analisis",
      icon: <IconGear />,
    },
  ];
}

export function NavLinks({
  activeHref,
  onNavigate,
}: {
  activeHref: string;
  onNavigate?: () => void;
}) {
  const items = navItems();

  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((item) => {
        // Exact match for the index route, prefix match elsewhere.
        const active =
          item.href === "/dashboard"
            ? activeHref === "/dashboard"
            : activeHref.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`group flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors ${
              active
                ? "bg-paper-900 text-paper-50"
                : "text-paper-600 hover:bg-paper-100 hover:text-paper-900"
            }`}
          >
            <span
              className={`mt-0.5 shrink-0 ${
                active ? "text-paper-200" : "text-paper-400 group-hover:text-paper-600"
              }`}
            >
              {item.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium leading-tight">{item.label}</span>
              <span
                className={`mt-0.5 block truncate text-[0.6875rem] leading-tight ${
                  active ? "text-paper-400" : "text-paper-400"
                }`}
              >
                {item.description}
              </span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-paper-900">
        <svg
          viewBox="0 0 24 24"
          className="size-[18px] text-paper-50"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 17.5 9 11l4 4 7.5-8" />
          <path d="M15 7h5.5v5.5" />
        </svg>
      </span>
      {compact ? null : (
        <span className="font-display text-[0.9375rem] font-semibold tracking-tight text-paper-900">
          SahamSignal
        </span>
      )}
    </Link>
  );
}

/* --------------------------------- Icons ---------------------------------- */

function IconGrid() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </svg>
  );
}

function IconSignal() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h4l3-8 4 16 3-8h4" />
    </svg>
  );
}

function IconStar() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1.1 5.8-5.3-2.8-5.3 2.8 1.1-5.8L3.5 9.7l5.9-.8z" />
    </svg>
  );
}

function IconGear() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
    </svg>
  );
}
