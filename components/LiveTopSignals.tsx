"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import type { SignalTier } from "@/lib/signal";
import { Card, CardHeader, EmptyState, SignalBadge, TrendTag } from "./ui";
import { formatSigned, formatPrice, relativeTime } from "@/lib/format";

export interface SignalRow {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  changePercent: number;
  score: number;
  confidence: number;
  tier: SignalTier;
  trend: "uptrend" | "downtrend" | "sideways";
  rsi: number | null;
  pe: number | null;
  stopLoss: number;
  takeProfit1: number;
  generatedAt: number;
}

/** Shape returned by GET /api/signals for one row. */
interface WireRow {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  changePercent: number;
  technical: {
    trend: "uptrend" | "downtrend" | "sideways";
    rsi14: number | null;
  };
  fundamental: {
    pe: number | null;
  };
  signal: {
    tier: SignalTier;
    score: number;
    confidence: number;
    risk: { stopLoss: number; takeProfit1: number };
    action: "buy" | "hold" | "sell";
  };
}

interface WireResponse {
  generatedAt: number;
  market?: { isOpen?: boolean };
  analysed: number;
  failures: Array<{ symbol: string; reason: string }>;
  results: WireRow[];
}

interface Counts {
  buy: number;
  hold: number;
  sell: number;
}

/** Poll cadence: brisk while the market is open, relaxed when it is closed. */
const OPEN_INTERVAL = 45_000;
const CLOSED_INTERVAL = 300_000;

function toRow(r: WireRow, generatedAt: number): SignalRow {
  return {
    symbol: r.symbol,
    name: r.name,
    sector: r.sector,
    price: r.price,
    changePercent: r.changePercent,
    score: r.signal.score,
    confidence: r.signal.confidence,
    tier: r.signal.tier,
    trend: r.technical.trend,
    rsi: r.technical.rsi14,
    pe: r.fundamental.pe,
    stopLoss: r.signal.risk.stopLoss,
    takeProfit1: r.signal.risk.takeProfit1,
    generatedAt,
  };
}

export function LiveTopSignals({
  initialBuy,
  initialSell,
  initialHold,
  counts: initialCounts,
  analysed: initialAnalysed,
  failures: initialFailures,
  generatedAt: initialGeneratedAt,
}: {
  initialBuy: SignalRow[];
  initialSell: SignalRow[];
  initialHold: SignalRow[];
  counts: Counts;
  analysed: number;
  failures: number;
  generatedAt: number;
}) {
  const [buy, setBuy] = useState(initialBuy);
  const [sell, setSell] = useState(initialSell);
  const [hold, setHold] = useState(initialHold);
  const [counts, setCounts] = useState(initialCounts);
  const [analysed, setAnalysed] = useState(initialAnalysed);
  const [failures, setFailures] = useState(initialFailures);
  const [generatedAt, setGeneratedAt] = useState(initialGeneratedAt);
  const [isOpen, setIsOpen] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stale, setStale] = useState(false);

  // Guard against overlapping polls and state updates after unmount.
  const inFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);

    try {
      const res = await fetch("/api/signals?limit=60", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = (await res.json()) as WireResponse;
      if (!mounted.current) return;

      const rows = data.results ?? [];
      const buys = rows.filter((r) => r.signal.action === "buy");
      const sells = rows.filter((r) => r.signal.action === "sell");
      const holds = rows.filter((r) => r.signal.action === "hold");

      setBuy(buys.slice(0, 5).map((r) => toRow(r, data.generatedAt)));
      setSell(sells.slice(0, 5).map((r) => toRow(r, data.generatedAt)));
      setHold(holds.slice(0, 4).map((r) => toRow(r, data.generatedAt)));
      setCounts({ buy: buys.length, hold: holds.length, sell: sells.length });
      setAnalysed(data.analysed);
      setFailures(data.failures?.length ?? 0);
      setGeneratedAt(data.generatedAt);
      setIsOpen(Boolean(data.market?.isOpen));
      setStale(false);
    } catch {
      if (mounted.current) setStale(true);
    } finally {
      inFlight.current = false;
      if (mounted.current) setRefreshing(false);
    }
  }, []);

  // Poll only while the tab is visible; self-rescheduling keeps the interval
  // tied to the market state.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    function schedule() {
      timer = setTimeout(async () => {
        if (document.visibilityState === "visible") await refresh();
        if (mounted.current) schedule();
      }, isOpen ? OPEN_INTERVAL : CLOSED_INTERVAL);
    }

    schedule();
    return () => clearTimeout(timer);
  }, [isOpen, refresh]);

  const total = counts.buy + counts.hold + counts.sell;

  return (
    <div className="flex flex-col gap-4">
      {/* Breadth summary ------------------------------------------------ */}
      <Card>
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="label">Ringkasan Sinyal</p>
            <p className="mt-1 font-display text-lg font-semibold text-paper-900">
              {total > 0
                ? `${counts.buy} beli · ${counts.hold} tahan · ${counts.sell} jual`
                : "Belum ada sinyal"}
            </p>
            <p className="mt-0.5 text-[0.6875rem] text-paper-500">
              dari {analysed} saham terbaca
              {failures > 0 ? ` · ${failures} gagal` : ""} · diperbarui{" "}
              {relativeTime(generatedAt)}
            </p>
          </div>

          {total > 0 ? (
            <div className="w-full max-w-xs">
              <div className="flex h-2 overflow-hidden rounded-full bg-paper-200">
                <div
                  className="bg-naik-500"
                  style={{ width: `${(counts.buy / total) * 100}%` }}
                  title={`${counts.buy} sinyal beli`}
                />
                <div
                  className="bg-paper-400"
                  style={{ width: `${(counts.hold / total) * 100}%` }}
                  title={`${counts.hold} sinyal tahan`}
                />
                <div
                  className="bg-turun-500"
                  style={{ width: `${(counts.sell / total) * 100}%` }}
                  title={`${counts.sell} sinyal jual`}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-[0.625rem] text-paper-500">
                <span className="up">Beli {counts.buy}</span>
                <span>Tahan {counts.hold}</span>
                <span className="down">Jual {counts.sell}</span>
              </div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="btn-secondary btn-sm shrink-0 self-start sm:self-auto"
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
            {refreshing ? "Memuat..." : "Perbarui"}
          </button>
        </div>

        {stale ? (
          <p className="border-t border-paper-100 px-5 py-2 text-[0.6875rem] text-turun-600">
            Gagal memuat data terbaru - menampilkan hasil terakhir.
          </p>
        ) : null}
      </Card>

      {/* Signal columns ------------------------------------------------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SignalColumn
          title="Peluang Beli"
          subtitle="Sinyal dengan skor gabungan tertinggi"
          rows={buy}
          emptyText="Tidak ada sinyal beli pada pemindaian terakhir."
          side="buy"
        />
        <SignalColumn
          title="Peluang Jual"
          subtitle="Sinyal dengan skor gabungan terendah"
          rows={sell}
          emptyText="Tidak ada sinyal jual pada pemindaian terakhir."
          side="sell"
        />
      </div>

      {hold.length > 0 ? (
        <Card>
          <CardHeader
            title="Saham Tahan"
            subtitle="Sinyal netral - belum ada momentum yang cukup"
          />
          <div className="grid gap-x-6 px-5 sm:grid-cols-2">
            {hold.map((r) => (
              <Link
                key={r.symbol}
                href={`/dashboard/saham/${r.symbol}`}
                className="flex items-center gap-3 border-b border-paper-100 py-2.5 transition-colors hover:bg-paper-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="tnum text-sm font-semibold text-paper-900">{r.symbol}</span>
                  <span className="ml-2 truncate text-xs text-paper-500">{r.name}</span>
                </span>
                <span className="tnum shrink-0 text-sm text-paper-700">
                  {formatPrice(r.price)}
                </span>
                <span
                  className={`tnum w-16 shrink-0 text-right text-xs font-medium ${
                    r.changePercent > 0 ? "up" : r.changePercent < 0 ? "down" : "flat"
                  }`}
                >
                  {formatSigned(r.changePercent)}
                </span>
              </Link>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function SignalColumn({
  title,
  subtitle,
  rows,
  emptyText,
  side,
}: {
  title: string;
  subtitle: string;
  rows: SignalRow[];
  emptyText: string;
  side: "buy" | "sell";
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader title={title} subtitle={subtitle} />
      {rows.length === 0 ? (
        <EmptyState title="Tidak ada sinyal" description={emptyText} />
      ) : (
        <ul className="flex-1 divide-y divide-paper-100">
          {rows.map((r) => (
            <li key={r.symbol}>
              <Link
                href={`/dashboard/saham/${r.symbol}`}
                className="block px-5 py-3.5 transition-colors hover:bg-paper-50"
              >
                <div className="flex items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="tnum text-sm font-semibold text-paper-900">
                        {r.symbol}
                      </span>
                      <span className="truncate text-xs text-paper-500">{r.name}</span>
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      <SignalBadge tier={r.tier} />
                      <TrendTag trend={r.trend} />
                    </span>
                  </span>

                  <span className="shrink-0 text-right">
                    <span className="tnum block text-sm font-semibold text-paper-900">
                      {formatPrice(r.price)}
                    </span>
                    <span
                      className={`tnum block text-xs font-medium ${
                        r.changePercent > 0 ? "up" : r.changePercent < 0 ? "down" : "flat"
                      }`}
                    >
                      {formatSigned(r.changePercent)}
                    </span>
                  </span>
                </div>

                <div className="mt-2.5 grid grid-cols-3 gap-2 text-[0.6875rem]">
                  <Metric
                    label="Skor"
                    value={`${r.score > 0 ? "+" : ""}${r.score.toFixed(0)}`}
                    tone={r.score > 15 ? "up" : r.score < -15 ? "down" : "flat"}
                  />
                  <Metric label="Yakin" value={`${r.confidence}%`} />
                  <Metric
                    label={side === "buy" ? "Target 1" : "Stop loss"}
                    value={formatPrice(side === "buy" ? r.takeProfit1 : r.stopLoss)}
                    tone={side === "buy" ? "up" : "down"}
                  />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Metric({
  label,
  value,
  tone = "flat",
}: {
  label: string;
  value: string;
  tone?: "up" | "down" | "flat";
}) {
  const toneClass =
    tone === "up" ? "text-naik-600" : tone === "down" ? "text-turun-600" : "text-paper-700";
  return (
    <span className="rounded-md bg-paper-100 px-2 py-1">
      <span className="block text-[0.5625rem] uppercase tracking-wide text-paper-400">
        {label}
      </span>
      <span className={`tnum mt-0.5 block font-medium ${toneClass}`}>{value}</span>
    </span>
  );
}
