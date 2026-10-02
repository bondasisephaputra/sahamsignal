"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { SignalTier } from "@/lib/signal";
import { Card, CardHeader, EmptyState, SignalBadge, TrendTag } from "./ui";
import { formatPrice, formatSigned, relativeTime } from "@/lib/format";

export interface WatchlistEntry {
  symbol: string;
  name?: string;
  sector?: string;
  price?: number;
  changePercent?: number;
  volume?: number;
  tier?: SignalTier;
  action?: "buy" | "hold" | "sell";
  score?: number;
  confidence?: number;
  trend?: "uptrend" | "downtrend" | "sideways";
  rsi?: number | null;
  stopLoss?: number;
  takeProfit1?: number;
  updatedAt?: number;
  error: string | null;
}

const OPEN_INTERVAL = 45_000;
const CLOSED_INTERVAL = 300_000;

/** Most recent stamp in the list, or `null` when nothing has a timestamp yet. */
function newestTimestamp(stamps: number[]): number | null {
  return stamps.length > 0 ? Math.max(...stamps) : null;
}

export function WatchlistView({ entries }: { entries: WatchlistEntry[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(entries);
  const [adding, setAdding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isOpen, setIsOpen] = useState(true);

  const inFlight = useRef(false);
  const mounted = useRef(true);

  // New rows arrive from the server; adopt them unless the user is mid-edit.
  // Adjusted during render (the documented pattern for a changed prop) rather
  // than in an effect, which would trigger a cascading second render.
  const [lastEntries, setLastEntries] = useState(entries);
  if (lastEntries !== entries) {
    setLastEntries(entries);
    setRows(entries);
  }

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const symbols = useMemo(
    () => entries.map((e) => e.symbol).filter(Boolean),
    [entries],
  );

  const refresh = useCallback(async () => {
    if (inFlight.current || symbols.length === 0) return;
    inFlight.current = true;
    setRefreshing(true);

    try {
      const res = await fetch(
        `/api/quotes?symbols=${symbols.join(",")}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (!mounted.current) return;

      setIsOpen(Boolean(data.market?.isOpen));

      const quotes = new Map<string, (typeof data.quotes)[number]>();
      for (const q of data.quotes ?? []) quotes.set(q.symbol, q);

      setRows((prev) =>
        prev.map((row) => {
          const q = quotes.get(row.symbol);
          if (!q) return row;
          return {
            ...row,
            price: q.price,
            changePercent: q.changePercent,
            tier: q.tier,
            action: q.action,
            score: q.score,
            error: null,
            updatedAt: Date.now(),
          };
        }),
      );
    } catch {
      // Keep the last known values rather than blanking the table.
    } finally {
      inFlight.current = false;
      if (mounted.current) setRefreshing(false);
    }
  }, [symbols]);

  // Poll on the market-appropriate cadence, only while visible.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, isOpen ? OPEN_INTERVAL : CLOSED_INTERVAL);
    return () => clearInterval(timer);
  }, [isOpen, refresh]);

  async function remove(symbol: string) {
    const snapshot = rows;
    setRows((prev) => prev.filter((r) => r.symbol !== symbol));

    try {
      const res = await fetch(`/api/watchlist?symbol=${encodeURIComponent(symbol)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.refresh();
    } catch {
      setRows(snapshot);
    }
  }

  // `Date.now()` is impure, so it cannot be read during render. Instead the
  // stamp is only shown once a real timestamp exists, and otherwise the
  // header reports the row count without a relative time.
  const newestUpdate = useMemo(() => {
    const stamps = rows.map((r) => r.updatedAt).filter((v): v is number => typeof v === "number");
    return newestTimestamp(stamps);
  }, [rows]);

  const filtered = rows;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-xl font-semibold tracking-tight text-paper-900">
          Watchlist
        </h1>
        <p className="text-sm text-paper-500">
          {rows.length > 0
            ? `${rows.length} saham dipantau${newestUpdate !== null ? ` · diperbarui ${relativeTime(newestUpdate)}` : ""}`
            : "Saham yang Anda pantau akan muncul di sini dengan sinyal terkini."}
        </p>
      </header>

      <Card>
        <CardHeader
          title={`${filtered.length} saham`}
          subtitle={isOpen ? "Pasar buka - harga diperbarui otomatis" : "Pasar tutup"}
          action={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAdding((v) => !v)}
                className="btn-secondary btn-sm"
              >
                <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Tambah
              </button>
              <button
                type="button"
                onClick={refresh}
                disabled={refreshing || rows.length === 0}
                className="btn-ghost btn-sm"
                title="Perbarui harga"
              >
                <svg
                  viewBox="0 0 24 24"
                  className={`size-3.5 ${refreshing ? "animate-spin" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                >
                  <path d="M21 12a9 9 0 1 1-2.6-6.4" />
                  <path d="M21 3v6h-6" />
                </svg>
              </button>
            </div>
          }
        />

        {adding ? (
          <AddSymbolForm
            existing={new Set(rows.map((r) => r.symbol))}
            onDone={() => {
              setAdding(false);
              router.refresh();
            }}
          />
        ) : null}

        {filtered.length === 0 ? (
          rows.length === 0 ? (
            <EmptyState
              title="Watchlist masih kosong"
              description="Tambahkan saham dari halaman sinyal, atau gunakan tombol Tambah di atas untuk mulai memantau."
              action={
                <Link href="/dashboard/sinyal" className="btn-secondary btn-sm">
                  Jelajahi sinyal
                </Link>
              }
            />
          ) : (
            <EmptyState title="Tidak ada yang cocok" description="Coba kata kunci lain." />
          )
        ) : (
          <div className="thin-scroll overflow-x-auto">
            <table className="table-base min-w-[52rem]">
              <thead>
                <tr>
                  <th>Saham</th>
                  <th>Sinyal</th>
                  <th className="text-right">Harga</th>
                  <th className="text-right">Perubahan</th>
                  <th className="text-right">Skor</th>
                  <th className="text-right">RSI</th>
                  <th className="text-right">Stop / Target</th>
                  <th className="w-16" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <WatchlistRow key={row.symbol} row={row} onRemove={remove} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {rows.length > 0 ? (
        <div className="flex justify-end">
          <ConfirmClear
            onDone={() => {
              setRows([]);
              router.refresh();
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function WatchlistRow({
  row,
  onRemove,
}: {
  row: WatchlistEntry;
  onRemove: (symbol: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);

  if (row.error) {
    return (
      <tr>
        <td>
          <span className="tnum text-sm font-semibold text-paper-900">{row.symbol}</span>
          <span className="mt-0.5 block text-[0.625rem] text-turun-600">{row.error}</span>
        </td>
        <td colSpan={6} className="text-xs text-paper-400">
          Analisis gagal dimuat.
        </td>
        <td>
          <RemoveButton
            confirming={confirming}
            onConfirm={() => onRemove(row.symbol)}
            onToggle={() => setConfirming((v) => !v)}
            symbol={row.symbol}
          />
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td>
        <Link href={`/dashboard/saham/${row.symbol}`} className="group block">
          <span className="tnum block text-sm font-semibold text-paper-900 group-hover:text-accent-600">
            {row.symbol}
          </span>
          <span className="mt-0.5 block max-w-[12rem] truncate text-xs text-paper-500">
            {row.name ?? row.symbol}
          </span>
        </Link>
      </td>

      <td>
        <div className="flex flex-col items-start gap-1">
          {row.tier ? <SignalBadge tier={row.tier} /> : null}
          {row.trend ? <TrendTag trend={row.trend} /> : null}
        </div>
      </td>

      <td className="text-right">
        <span className="tnum text-sm font-medium text-paper-900">
          {row.price !== undefined ? formatPrice(row.price) : "-"}
        </span>
      </td>

      <td className="text-right">
        <span
          className={`tnum text-sm font-medium ${
            (row.changePercent ?? 0) > 0
              ? "up"
              : (row.changePercent ?? 0) < 0
                ? "down"
                : "flat"
          }`}
        >
          {row.changePercent !== undefined ? formatSigned(row.changePercent) : "-"}
        </span>
      </td>

      <td className="text-right">
        <span
          className={`tnum text-sm font-medium ${
            (row.score ?? 0) > 15
              ? "up"
              : (row.score ?? 0) < -15
                ? "down"
                : "flat"
          }`}
        >
          {row.score !== undefined
            ? `${row.score > 0 ? "+" : ""}${row.score.toFixed(0)}`
            : "-"}
        </span>
        {row.confidence !== undefined ? (
          <span className="mt-0.5 block text-[0.625rem] text-paper-400">
            {row.confidence}%
          </span>
        ) : null}
      </td>

      <td className="text-right">
        <span
          className={`tnum text-sm ${
            row.rsi == null
              ? "text-paper-400"
              : row.rsi >= 70
                ? "down"
                : row.rsi <= 30
                  ? "up"
                  : "text-paper-700"
          }`}
        >
          {row.rsi != null ? row.rsi.toFixed(0) : "-"}
        </span>
      </td>

      <td className="text-right">
        <span className="tnum block text-xs font-medium text-turun-600">
          {row.stopLoss !== undefined ? formatPrice(row.stopLoss) : "-"}
        </span>
        <span className="tnum mt-0.5 block text-xs font-medium text-naik-600">
          {row.takeProfit1 !== undefined ? formatPrice(row.takeProfit1) : "-"}
        </span>
      </td>

      <td>
        <RemoveButton
          confirming={confirming}
          onConfirm={() => onRemove(row.symbol)}
          onToggle={() => setConfirming((v) => !v)}
          symbol={row.symbol}
        />
      </td>
    </tr>
  );
}

function RemoveButton({
  confirming,
  onConfirm,
  onToggle,
  symbol,
}: {
  confirming: boolean;
  onConfirm: () => void;
  onToggle: () => void;
  symbol: string;
}) {
  if (!confirming) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="btn-ghost btn-sm"
        title={`Hapus ${symbol}`}
        aria-label={`Hapus ${symbol} dari watchlist`}
      >
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 7h16M10 11v6M14 11v6" />
          <path d="M6 7l1 13h10l1-13M9 7V4h6v3" />
        </svg>
      </button>
    );
  }

  return (
    <span className="flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={onConfirm}
        className="btn-danger btn-sm"
        aria-label={`Konfirmasi hapus ${symbol}`}
      >
        Hapus
      </button>
      <button
        type="button"
        onClick={onToggle}
        className="btn-ghost btn-sm"
        aria-label="Batal"
      >
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      </button>
    </span>
  );
}

/* -------------------------------------------------------------------------- */

function AddSymbolForm({
  existing,
  onDone,
}: {
  existing: Set<string>;
  onDone: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    Array<{ symbol: string; name: string; sector?: string | null }>
  >([]);
  const [selected, setSelected] = useState<{ symbol: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [searching, setSearching] = useState(false);

  // Debounced lookup against the search API.
  useEffect(() => {
    // Clear synchronously only when there is nothing to search for; otherwise
    // let the timer below own `results`, so this effect never sets state
    // during its own body in a way that cascades.
    if (selected || query.trim().length === 0) {
      const timer = setTimeout(() => setResults([]), 0);
      return () => clearTimeout(timer);
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!cancelled) setResults((data.results ?? []).slice(0, 6));
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, selected]);

  async function submit() {
    if (!selected) return;
    setPending(true);
    setError(null);

    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: selected.symbol }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal menambahkan.");
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setPending(false);
    }
  }

  return (
    <div className="border-b border-paper-100 bg-paper-50/60 px-5 py-4">
      {selected ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex size-8 items-center justify-center rounded-md bg-accent-600 text-[0.6875rem] font-semibold text-white">
            {selected.symbol}
          </span>
          <span className="min-w-0 flex-1 text-sm text-paper-700">
            <span className="tnum font-semibold text-paper-900">{selected.symbol}</span>
            <span className="ml-2 text-paper-500">{selected.name}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setQuery("");
            }}
            className="btn-ghost btn-sm"
          >
            Ganti
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending || existing.has(selected.symbol)}
            className="btn-primary btn-sm"
          >
            {existing.has(selected.symbol)
              ? "Sudah ada"
              : pending
                ? "Menyimpan..."
                : "Tambahkan"}
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari kode atau nama saham, contoh: BBCA atau Bank Central"
              className="input"
              aria-label="Cari saham untuk ditambahkan"
              autoFocus
            />
            {searching ? (
              <svg
                viewBox="0 0 24 24"
                className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-paper-400"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M21 12a9 9 0 1 1-2.6-6.4" />
                <path d="M21 3v6h-6" />
              </svg>
            ) : null}
          </div>

          {results.length > 0 ? (
            <ul className="mt-2 divide-y divide-paper-100 overflow-hidden rounded-lg border border-paper-200 bg-white">
              {results.map((r) => {
                const already = existing.has(r.symbol);
                return (
                  <li key={r.symbol}>
                    <button
                      type="button"
                      disabled={already}
                      onClick={() => setSelected({ symbol: r.symbol, name: r.name })}
                      className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-paper-50 disabled:opacity-45"
                    >
                      <span className="tnum w-12 shrink-0 text-sm font-semibold text-paper-900">
                        {r.symbol}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs text-paper-700">{r.name}</span>
                        {r.sector ? (
                          <span className="block text-[0.625rem] text-paper-400">
                            {r.sector}
                          </span>
                        ) : null}
                      </span>
                      {already ? (
                        <span className="shrink-0 text-[0.625rem] text-paper-400">
                          sudah dipantau
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : query.trim().length > 0 && !searching ? (
            <p className="mt-2 text-[0.6875rem] text-paper-400">
              Tidak ada hasil untuk &quot;{query.trim()}&quot;.
            </p>
          ) : null}

          {error ? (
            <p className="mt-2 text-[0.6875rem] text-turun-600">{error}</p>
          ) : null}
        </>
      )}
    </div>
  );
}

function ConfirmClear({ onDone }: { onDone: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="btn-ghost btn-sm text-paper-500"
      >
        Kosongkan watchlist
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <span className="text-xs text-paper-500">Hapus semua?</span>
      <button
        type="button"
        className="btn-ghost btn-sm"
        onClick={() => setConfirming(false)}
        disabled={pending}
      >
        Batal
      </button>
      <button
        type="button"
        className="btn-danger btn-sm"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          try {
            await fetch("/api/watchlist?symbol=__all__", { method: "DELETE" });
            onDone();
          } finally {
            setPending(false);
            setConfirming(false);
          }
        }}
      >
        {pending ? "Menghapus..." : "Ya, kosongkan"}
      </button>
    </span>
  );
}