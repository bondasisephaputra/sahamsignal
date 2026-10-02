"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { SignalRow, AnalysisFailure } from "@/lib/analysis";
import { Card, CardHeader, EmptyState, SignalBadge, TrendTag } from "./ui";
import { WatchlistButton } from "./WatchlistButton";
import { formatSigned, formatPrice, relativeTime } from "@/lib/format";

const OPEN_INTERVAL = 45_000;
const CLOSED_INTERVAL = 300_000;

const ACTION_TABS = [
  { key: "", label: "Semua" },
  { key: "buy", label: "Beli" },
  { key: "hold", label: "Tahan" },
  { key: "sell", label: "Jual" },
] as const;

type SortKey =
  | "score"
  | "confidence"
  | "price"
  | "changePercent"
  | "rsi"
  | "pe"
  | "symbol";

interface SignalExplorerProps {
  sectors: string[];
  universeSize: number;
  initialSector: string;
  initialAction: string;
  initialRows: SignalRow[];
  initialGeneratedAt: number;
  scanned: number;
  analysed: number;
  failures: AnalysisFailure[];
}

export function SignalExplorer({
  sectors,
  universeSize,
  initialSector,
  initialAction,
  initialRows,
  initialGeneratedAt,
  scanned: initialScanned,
  analysed: initialAnalysed,
  failures: initialFailures,
}: SignalExplorerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // The URL is the single source of truth for these two filters: a bookmark,
  // a shared link, or the back button all land on the view the user expects,
  // and there is no second copy of the state to keep in sync.
  const sector = searchParams.get("sektor") ?? initialSector;
  const action = searchParams.get("aksi") ?? initialAction;

  const setFilters = useCallback(
    (next: { sector?: string; action?: string }) => {
      const params = new URLSearchParams(searchParams.toString());
      const s = next.sector ?? sector;
      const a = next.action ?? action;
      if (s) params.set("sektor", s);
      else params.delete("sektor");
      if (a) params.set("aksi", a);
      else params.delete("aksi");

      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [action, pathname, router, searchParams, sector],
  );

  const setSector = useCallback((v: string) => setFilters({ sector: v }), [setFilters]);
  const setAction = useCallback((v: string) => setFilters({ action: v }), [setFilters]);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [minConfidence, setMinConfidence] = useState(0);
  const [onlyWithFundamentals, setOnlyWithFundamentals] = useState(false);

  const [rows, setRows] = useState(initialRows);
  const [generatedAt, setGeneratedAt] = useState(initialGeneratedAt);
  const [isOpen, setIsOpen] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stale, setStale] = useState(false);
  const [scanned, setScanned] = useState(initialScanned);
  const [analysed, setAnalysed] = useState(initialAnalysed);
  const [failures, setFailures] = useState(initialFailures);

  const inFlight = useRef(false);
  const mounted = useRef(true);
  const firstFetch = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /* ------------------------------ Fetching ---------------------------- */

  const fetchRows = useCallback(
    async (opts: { sector: string; action: string }) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setRefreshing(true);

      try {
        const params = new URLSearchParams();
        if (opts.sector) params.set("sectors", opts.sector);
        if (opts.action) params.set("action", opts.action);
        params.set("limit", "200");

        const res = await fetch(`/api/signals?${params.toString()}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        if (!mounted.current) return;

        setRows(data.results ?? []);
        setGeneratedAt(data.generatedAt);
        setIsOpen(Boolean(data.market?.isOpen));
        setScanned(data.scanned ?? 0);
        setAnalysed(data.analysed ?? 0);
        setFailures(data.failures ?? []);
        setStale(false);
      } catch {
        if (mounted.current) setStale(true);
      } finally {
        inFlight.current = false;
        if (mounted.current) setRefreshing(false);
      }
    },
    [],
  );

  // Re-fetch whenever the URL-derived filters change. The first render is served
  // from the server payload, so there is nothing to fetch yet.
  useEffect(() => {
    if (firstFetch.current) {
      firstFetch.current = false;
      return;
    }
    fetchRows({ sector, action });
  }, [action, fetchRows, sector]);

  // Poll, aligned to market hours, only while the tab is visible.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    function schedule() {
      timer = setTimeout(async () => {
        if (document.visibilityState === "visible") {
          await fetchRows({ sector, action });
        }
        if (mounted.current) schedule();
      }, isOpen ? OPEN_INTERVAL : CLOSED_INTERVAL);
    }

    schedule();
    return () => clearTimeout(timer);
  }, [isOpen, sector, action, fetchRows]);

  /* --------------------------- Derived view --------------------------- */

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase();
    return rows.filter((r) => {
      if (minConfidence > 0 && r.signal.confidence < minConfidence) return false;
      if (onlyWithFundamentals && !r.fundamental.available) return false;
      if (!q) return true;
      return (
        r.symbol.includes(q) ||
        r.name.toUpperCase().includes(q) ||
        r.sector.toUpperCase().includes(q)
      );
    });
  }, [rows, search, minConfidence, onlyWithFundamentals]);

  const sorted = useMemo(() => {
    const dir = sortDir === "desc" ? -1 : 1;
    const value = (r: SignalRow): number | string => {
      switch (sortKey) {
        case "confidence":
          return r.signal.confidence;
        case "price":
          return r.price;
        case "changePercent":
          return r.changePercent;
        case "rsi":
          return r.technical.rsi14 ?? -999;
        case "pe":
          return r.fundamental.pe ?? 9999;
        case "symbol":
          return r.symbol;
        default:
          return Math.abs(r.signal.score);
      }
    };

    return [...filtered].sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      return (Number(av) - Number(bv)) * dir;
    });
  }, [filtered, sortKey, sortDir]);

  const counts = useMemo(
    () => ({
      buy: filtered.filter((r) => r.signal.action === "buy").length,
      hold: filtered.filter((r) => r.signal.action === "hold").length,
      sell: filtered.filter((r) => r.signal.action === "sell").length,
    }),
    [filtered],
  );

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      // Symbols read best A-Z; every numeric column reads best high-first.
      setSortDir(key === "symbol" ? "asc" : "desc");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-xl font-semibold tracking-tight text-paper-900">
          Sinyal Trading
        </h1>
        <p className="text-sm text-paper-500">
          Screening {universeSize} saham liquid IDX · diperbarui {relativeTime(generatedAt)}
          {refreshing ? " · memuat..." : ""}
        </p>
      </header>

      {/* Filters --------------------------------------------------------- */}
      <Card>
        <div className="flex flex-col gap-4 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <svg
                viewBox="0 0 24 24"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-paper-400"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari kode atau nama saham..."
                className="input pl-9"
                aria-label="Cari saham"
              />
            </div>

            <select
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              className="select sm:w-52"
              aria-label="Filter sektor"
            >
              <option value="">Semua sektor</option>
              {sectors.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => fetchRows({ sector, action })}
              disabled={refreshing}
              className="btn-secondary shrink-0"
            >
              <svg
                viewBox="0 0 24 24"
                className={`size-4 ${refreshing ? "animate-spin" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              >
                <path d="M21 12a9 9 0 1 1-2.6-6.4" />
                <path d="M21 3v6h-6" />
              </svg>
              Perbarui
            </button>
          </div>

          {/* Action tabs */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-paper-200 bg-paper-100 p-0.5">
              {ACTION_TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setAction(t.key)}
                  aria-pressed={action === t.key}
                  className={`rounded-[0.4rem] px-3 py-1 text-xs font-medium transition-colors ${
                    action === t.key
                      ? "bg-white text-paper-900 shadow-sm"
                      : "text-paper-500 hover:text-paper-800"
                  }`}
                >
                  {t.label}
                  {t.key !== "" ? (
                    <span className="tnum ml-1 opacity-60">
                      {t.key === "buy" ? counts.buy : t.key === "hold" ? counts.hold : counts.sell}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-xs text-paper-600">
                <span className="whitespace-nowrap">
                  Keyakinan min. <span className="tnum font-medium">{minConfidence}%</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={90}
                  step={10}
                  value={minConfidence}
                  onChange={(e) => setMinConfidence(Number(e.target.value))}
                  className="w-24 accent-paper-800"
                  aria-label="Ambang keyakinan minimum"
                />
              </label>

              <label className="flex cursor-pointer items-center gap-2 text-xs text-paper-600">
                <input
                  type="checkbox"
                  checked={onlyWithFundamentals}
                  onChange={(e) => setOnlyWithFundamentals(e.target.checked)}
                  className="size-3.5 rounded border-paper-300 accent-paper-800"
                />
                Hanya yang ada data fundamental
              </label>
            </div>
          </div>
        </div>
      </Card>

      {stale ? (
        <p className="rounded-lg border border-turun-200 bg-turun-50 px-4 py-2.5 text-xs text-turun-700">
          Gagal memuat data terbaru - menampilkan hasil terakhir.
        </p>
      ) : null}

      {/* Table ----------------------------------------------------------- */}
      <Card>
        <CardHeader
          title={`${sorted.length} saham`}
          subtitle={`${analysed} terbaca dari ${scanned} dipindai${
            failures.length > 0 ? ` · ${failures.length} gagal` : ""
          }`}
          action={
            <span className="hidden items-center gap-1.5 text-[0.6875rem] text-paper-500 sm:flex">
              <span
                className={`size-1.5 rounded-full ${isOpen ? "live-dot bg-naik-500" : "bg-paper-400"}`}
              />
              {isOpen ? "Pasar buka - auto refresh" : "Pasar tutup"}
            </span>
          }
        />

        {sorted.length === 0 ? (
          <EmptyState
            title="Tidak ada saham yang cocok"
            description="Coba longgarkan filter sektor, aksi, atau turunkan ambang keyakinan."
            action={
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setSector("");
                  setAction("");
                  setMinConfidence(0);
                  setOnlyWithFundamentals(false);
                }}
                className="btn-secondary btn-sm"
              >
                Reset filter
              </button>
            }
          />
        ) : (
          <div className="thin-scroll overflow-x-auto">
            <table className="table-base min-w-[64rem]">
              <thead>
                <tr>
                  <SortTh label="Saham" k="symbol" active={sortKey} dir={sortDir} onClick={toggleSort} />
                  <th>Sinyal</th>
                  <SortTh label="Harga" k="price" active={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
                  <SortTh label="Perubahan" k="changePercent" active={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
                  <SortTh label="Skor" k="score" active={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
                  <SortTh label="Keyakinan" k="confidence" active={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
                  <th className="text-right">Teknikal</th>
                  <th className="text-right">Fundamental</th>
                  <SortTh label="RSI" k="rsi" active={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
                  <SortTh label="PER" k="pe" active={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
                  <th className="text-right">Stop / Target</th>
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <SignalTableRow key={r.symbol} row={r} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <FailuresNote failures={failures} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function SignalTableRow({ row }: { row: SignalRow }) {
  const { signal, technical, fundamental } = row;

  return (
    <tr>
      <td>
        <Link href={`/dashboard/saham/${row.symbol}`} className="group block">
          <span className="tnum block text-sm font-semibold text-paper-900 group-hover:text-accent-600">
            {row.symbol}
          </span>
          <span className="mt-0.5 block max-w-[13rem] truncate text-xs text-paper-500">
            {row.name}
          </span>
          <span className="mt-0.5 block text-[0.625rem] text-paper-400">{row.sector}</span>
        </Link>
      </td>

      <td>
        <div className="flex flex-col items-start gap-1">
          <SignalBadge tier={signal.tier} />
          <TrendTag trend={technical.trend} />
        </div>
      </td>

      <td className="text-right">
        <span className="tnum block text-sm font-medium text-paper-900">
          {formatPrice(row.price)}
        </span>
        <span className="tnum mt-0.5 block text-[0.625rem] text-paper-400">
          Vol {compactVolume(row.volume)}
        </span>
      </td>

      <td className="text-right">
        <span
          className={`tnum text-sm font-medium ${
            row.changePercent > 0 ? "up" : row.changePercent < 0 ? "down" : "flat"
          }`}
        >
          {formatSigned(row.changePercent)}
        </span>
      </td>

      <td className="text-right">
        <span
          className={`tnum text-sm font-semibold ${
            signal.score > 15 ? "up" : signal.score < -15 ? "down" : "flat"
          }`}
        >
          {signal.score > 0 ? "+" : ""}
          {signal.score.toFixed(0)}
        </span>
      </td>

      <td className="text-right">
        <span className="tnum text-sm text-paper-700">{signal.confidence}%</span>
        <span className="mt-1 block h-1 w-14 overflow-hidden rounded-full bg-paper-200">
          <span
            className={`block h-full rounded-full ${
              signal.confidence >= 70
                ? "bg-naik-500"
                : signal.confidence >= 45
                  ? "bg-accent-500"
                  : "bg-paper-400"
            }`}
            style={{ width: `${signal.confidence}%` }}
          />
        </span>
      </td>

      <td className="text-right">
        <ScoreCell score={technical.score} />
      </td>
      <td className="text-right">
        {fundamental.available ? (
          <ScoreCell score={fundamental.score} />
        ) : (
          <span className="text-xs text-paper-400">-</span>
        )}
      </td>

      <td className="text-right">
        <RsiCell value={technical.rsi14} />
      </td>

      <td className="text-right">
        <span className="tnum text-sm text-paper-700">
          {fundamental.pe !== null ? `${fundamental.pe.toFixed(1)}x` : "-"}
        </span>
      </td>

      <td className="text-right">
        <span
          className={`tnum block text-xs font-medium ${
            signal.action === "buy" ? "text-turun-600" : "text-naik-600"
          }`}
        >
          {formatPrice(signal.risk.stopLoss)}
        </span>
        <span
          className={`tnum mt-0.5 block text-xs font-medium ${
            signal.action === "buy" ? "text-naik-600" : "text-turun-600"
          }`}
        >
          {formatPrice(signal.risk.takeProfit1)}
        </span>
      </td>

      <td>
        <div className="flex items-center justify-end gap-1">
          <WatchlistButton symbol={row.symbol} />
          <Link
            href={`/dashboard/saham/${row.symbol}`}
            className="btn-ghost btn-sm"
            aria-label={`Detail ${row.symbol}`}
          >
            <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </Link>
        </div>
      </td>
    </tr>
  );
}

function ScoreCell({ score }: { score: number }) {
  const tone = score > 15 ? "up" : score < -15 ? "down" : "flat";
  return (
    <span className={`tnum text-sm font-medium ${tone}`}>
      {score > 0 ? "+" : ""}
      {score.toFixed(0)}
    </span>
  );
}

function RsiCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-paper-400">-</span>;
  const tone = value >= 70 ? "down" : value <= 30 ? "up" : "flat";
  return <span className={`tnum text-sm font-medium ${tone}`}>{value.toFixed(0)}</span>;
}

function SortTh({
  label,
  k,
  active,
  dir,
  onClick,
  align = "left",
}: {
  label: string;
  k: SortKey;
  active: SortKey;
  dir: "asc" | "desc";
  onClick: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const isActive = active === k;
  return (
    <th
      className={align === "right" ? "text-right" : undefined}
      // `aria-sort` belongs on the header cell, not on the button inside it.
      aria-sort={isActive ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onClick(k)}
        className={`inline-flex items-center gap-1 transition-colors hover:text-paper-900 ${
          isActive ? "text-paper-900" : ""
        } ${align === "right" ? "flex-row-reverse" : ""}`}
      >
        {label}
        <span className={isActive ? "opacity-100" : "opacity-0"}>
          <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            {dir === "desc" ? <path d="m6 9 6 6 6-6" /> : <path d="m18 15-6-6-6 6" />}
          </svg>
        </span>
      </button>
    </th>
  );
}

function FailuresNote({ failures }: { failures: AnalysisFailure[] }) {
  if (failures.length === 0) return null;

  return (
    <details className="card group px-5 py-4">
      <summary className="cursor-pointer list-none text-xs font-medium text-paper-600 marker:hidden">
        <span className="flex items-center gap-1.5">
          <svg viewBox="0 0 24 24" className="size-3.5 text-paper-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
          {failures.length} saham tidak dapat dianalisis
        </span>
      </summary>
      <ul className="mt-3 space-y-1 border-t border-paper-100 pt-3">
        {failures.map((f) => (
          <li key={f.symbol} className="flex gap-2 text-[0.6875rem] text-paper-500">
            <span className="tnum w-12 shrink-0 font-medium text-paper-700">{f.symbol}</span>
            <span>{f.reason}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function compactVolume(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}M`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}jt`;
  if (v >= 1e3) return `${Math.round(v / 1e3)}rb`;
  return String(Math.round(v));
}
