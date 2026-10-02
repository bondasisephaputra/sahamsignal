"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { MarketStatus } from "@/lib/market";
import { Brand, NavLinks } from "./NavLinks";

export interface ShellUser {
  name: string;
  email: string;
}

export function DashboardShell({
  user,
  market,
  localDb,
  children,
}: {
  user: ShellUser;
  market: MarketStatus;
  localDb: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the account dropdown on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;

    function onPointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  // Close the mobile drawer whenever the route changes. Adjusted during render
  // (the documented pattern for reacting to a changed prop) rather than in an
  // effect, which would cause a cascading second render.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMenuOpen(false);
  }

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="min-h-screen">
      {/* ------------------------------ Top bar ------------------------------ */}
      <header className="sticky top-0 z-40 border-b border-paper-200 bg-paper-50/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="btn-ghost btn-sm lg:hidden"
            aria-label="Buka navigasi"
            aria-expanded={menuOpen}
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>

          <Brand />

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <MarketPill market={market} />

            {localDb ? (
              <span
                className="hidden items-center gap-1.5 rounded-lg border border-paper-200 bg-white px-2.5 py-1.5 text-[0.6875rem] text-paper-500 md:inline-flex"
                title="Data tersimpan di database SQLite lokal"
              >
                <span className="size-1.5 rounded-full bg-naik-500" />
                DB lokal
              </span>
            ) : null}

            {/* Account menu */}
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 rounded-lg border border-paper-200 bg-white py-1 pl-1 pr-2 transition-colors hover:bg-paper-100"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <span className="flex size-7 items-center justify-center rounded-md bg-accent-600 text-[0.6875rem] font-semibold text-white">
                  {initials(user.name)}
                </span>
                <span className="hidden max-w-[9rem] truncate text-xs font-medium text-paper-700 sm:block">
                  {user.name}
                </span>
                <svg viewBox="0 0 24 24" className="size-3.5 text-paper-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>

              {menuOpen ? (
                <div
                  role="menu"
                  className="fade-up absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-paper-200 bg-white shadow-lg shadow-paper-900/5"
                >
                  <div className="border-b border-paper-100 px-4 py-3">
                    <p className="truncate text-sm font-medium text-paper-900">{user.name}</p>
                    <p className="truncate text-xs text-paper-500">{user.email}</p>
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={signOut}
                    disabled={signingOut}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-paper-700 transition-colors hover:bg-paper-100 disabled:opacity-50"
                  >
                    <svg viewBox="0 0 24 24" className="size-4 text-paper-400" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <path d="m16 17 5-5-5-5M21 12H9" />
                    </svg>
                    {signingOut ? "Keluar..." : "Keluar"}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1400px] gap-6 px-4 py-6 sm:px-6">
        {/* ------------------------------ Sidebar ----------------------------- */}
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-20">
            <NavLinks activeHref={pathname} />
            <Disclaimer />
          </div>
        </aside>

        {/* Mobile drawer */}
        {menuOpen ? (
          <div className="fixed inset-0 z-30 lg:hidden">
            <button
              type="button"
              aria-label="Tutup navigasi"
              className="absolute inset-0 bg-paper-900/20 backdrop-blur-sm"
              onClick={() => setMenuOpen(false)}
            />
            <div className="fade-up absolute inset-y-0 left-0 w-64 overflow-y-auto border-r border-paper-200 bg-paper-50 p-4 shadow-xl">
              <NavLinks activeHref={pathname} onNavigate={() => setMenuOpen(false)} />
              <Disclaimer />
            </div>
          </div>
        ) : null}

        {/* ------------------------------- Main ------------------------------- */}
        <main className="min-w-0 flex-1 pb-16">{children}</main>
      </div>
    </div>
  );
}

function MarketPill({ market }: { market: MarketStatus }) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-paper-200 bg-white px-2.5 py-1.5"
      title={`${market.wibWeekday}, ${market.wibDate} · ${market.wibTime} WIB`}
    >
      <span
        className={`size-1.5 rounded-full ${
          market.isOpen ? "live-dot bg-naik-500" : "bg-paper-400"
        }`}
      />
      <span className="hidden text-[0.6875rem] font-medium text-paper-600 sm:block">
        {market.label}
      </span>
      <span className="tnum text-[0.6875rem] text-paper-400">{market.wibTime}</span>
    </div>
  );
}

function Disclaimer() {
  return (
    <div className="mt-6 rounded-lg border border-paper-200 bg-paper-100/60 p-3">
      <p className="text-[0.625rem] font-semibold uppercase tracking-[0.08em] text-paper-500">
        Perhatian
      </p>
      <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-paper-500">
        Sinyal dihitung secara otomatis dari data publik dan bukan nasihat keuangan.
        Verifikasi setiap keputusan sebelum bertransaksi.
      </p>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
