"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { StockAnalysis } from "@/lib/analysis";
import { sma } from "@/lib/technical";
import { PriceChart } from "./PriceChart";
import { WatchlistButton } from "./WatchlistButton";
import {
  BiasDot,
  Card,
  CardHeader,
  EmptyState,
  MetricRow,
  ScoreBar,
  SignalBadge,
  TrendTag,
} from "./ui";
import {
  formatIDR,
  formatNumber,
  formatPrice,
  formatReportPeriod,
  formatSigned,
  formatCompactInt,
  formatWIBTime,
  relativeTime,
} from "@/lib/format";

const OPEN_INTERVAL = 45_000;
const CLOSED_INTERVAL = 300_000;

interface StockDetailProps {
  analysis: StockAnalysis;
  isWatched: boolean;
  sector: string;
}

export function StockDetail({ analysis: initial, isWatched, sector }: StockDetailProps) {
  const [analysis, setAnalysis] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [stale, setStale] = useState(false);
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
      const res = await fetch(`/api/saham/${analysis.symbol}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (mounted.current && data.analysis) {
        setAnalysis(data.analysis);
        setStale(false);
      }
    } catch {
      if (mounted.current) setStale(true);
    } finally {
      inFlight.current = false;
      if (mounted.current) setRefreshing(false);
    }
  }, [analysis.symbol]);

  // Auto-refresh aligned to the session, only while the tab is visible.
  useEffect(() => {
    const interval = analysis.marketState === "REGULAR" ? OPEN_INTERVAL : CLOSED_INTERVAL;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, interval);
    return () => clearInterval(timer);
  }, [analysis.marketState, refresh]);

  const { signal, technical, fundamental } = analysis;
  const isBuy = signal.action === "buy";

  // Moving-average overlays drawn on top of the candles.
  const overlays = useMemo(() => {
    const closes = analysis.candles.map((c) => c.c);
    return [
      { label: "MA20", values: sma(closes, 20), color: "var(--color-accent-500)" },
      { label: "MA50", values: sma(closes, 50), color: "var(--color-accent-300)" },
    ];
  }, [analysis.candles]);

  const levels = useMemo(() => {
    const out: Array<{ price: number; label: string; color: string }> = [];
    // Only draw levels that are actionable in the signal's own direction.
    if (isBuy) {
      out.push({ price: signal.risk.stopLoss, label: "SL", color: "var(--color-turun-500)" });
      out.push({ price: signal.risk.takeProfit1, label: "TP1", color: "var(--color-naik-500)" });
      out.push({ price: signal.risk.takeProfit2, label: "TP2", color: "var(--color-naik-500)" });
    } else {
      out.push({ price: signal.risk.takeProfit1, label: "TP", color: "var(--color-turun-500)" });
      if (signal.action === "hold") {
        out.push({ price: signal.risk.stopLoss, label: "SL", color: "var(--color-naik-500)" });
      }
    }
    return out;
  }, [isBuy, signal.action, signal.risk]);

  return (
    <div className="flex flex-col gap-5">
      {/* ------------------------------ Header ----------------------------- */}
      <header className="flex flex-col gap-4">
        <nav className="flex items-center gap-1.5 text-xs text-paper-500">
          <Link href="/dashboard/sinyal" className="hover:text-paper-800 hover:underline">
            Sinyal
          </Link>
          <span aria-hidden>/</span>
          <span className="tnum font-medium text-paper-700">{analysis.symbol}</span>
        </nav>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="tnum font-display text-2xl font-semibold tracking-tight text-paper-900">
                {analysis.symbol}
              </h1>
              <SignalBadge tier={signal.tier} size="md" />
              <TrendTag trend={technical.trend} />
              <WatchlistButton symbol={analysis.symbol} initialSaved={isWatched} />
            </div>
            <p className="mt-1 text-sm text-paper-500">
              {analysis.name} · <span className="text-paper-400">{sector}</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <p
                className={`tnum font-display text-3xl font-semibold tracking-tight ${
                  analysis.changePercent > 0
                    ? "up"
                    : analysis.changePercent < 0
                      ? "down"
                      : "flat"
                }`}
              >
                {formatPrice(analysis.price)}
              </p>
              <p
                className={`tnum text-sm font-medium ${
                  analysis.changePercent > 0
                    ? "up"
                    : analysis.changePercent < 0
                      ? "down"
                      : "flat"
                }`}
              >
                {analysis.change > 0 ? "+" : ""}
                {formatPrice(analysis.change)} ({formatSigned(analysis.changePercent)})
              </p>
            </div>
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="btn-secondary btn-sm"
              title="Muat ulang analisis"
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
              {refreshing ? "Memuat" : "Perbarui"}
            </button>
          </div>
        </div>

        <p className="text-[0.6875rem] text-paper-400">
          Terakhir diperbarui {relativeTime(signal.generatedAt)}
          {analysis.lastTradeAt ? ` · transaksi terakhir ${formatWIBTime(analysis.lastTradeAt)} WIB` : ""}
          {" · "}
          {analysis.marketState === "REGULAR" ? "sesi aktif" : "di luar sesi"}
        </p>
      </header>

      {stale ? (
        <p className="rounded-lg border border-turun-200 bg-turun-50 px-4 py-2.5 text-xs text-turun-700">
          Gagal memuat data terbaru - menampilkan hasil terakhir.
        </p>
      ) : null}

      {/* ---------------------------- Signal card -------------------------- */}
      <Card>
        <div className="grid gap-6 p-5 lg:grid-cols-[1.15fr_1fr]">
          <div>
            <div className="flex items-center gap-2">
              <span className="label">Rekomendasi</span>
              <span className="text-[0.625rem] text-paper-400">
                keyakinan {signal.confidence}%
              </span>
            </div>

            <div className="mt-2 flex items-baseline gap-3">
              <span
                className={`font-display text-2xl font-semibold ${
                  isBuy ? "up" : signal.action === "sell" ? "down" : "flat"
                }`}
              >
                {signal.label}
              </span>
              <span className="tnum text-sm text-paper-500">
                skor {signal.score > 0 ? "+" : ""}
                {signal.score.toFixed(0)}/100
              </span>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-paper-600">{signal.summary}</p>

            {/* Score decomposition */}
            <div className="mt-5 space-y-3">
              <ScoreRow
                label="Komponen teknikal"
                score={signal.techScore}
                weight="60%"
                detail={`${technical.verdicts.filter((v) => v.bias === "bullish").length} bullish vs ${technical.verdicts.filter((v) => v.bias === "bearish").length} bearish`}
              />
              <ScoreRow
                label="Komponen fundamental"
                score={signal.fundScore}
                weight="40%"
                detail={
                  fundamental.available
                    ? `${formatReportPeriod(fundamental.period)} · cakupan ${fundamental.coverage.toFixed(0)}%`
                    : "data tidak tersedia"
                }
              />
            </div>

            {signal.reasons.length > 0 ? (
              <div className="mt-5">
                <p className="label mb-2">Alasan</p>
                <ul className="space-y-1.5">
                  {signal.reasons.map((r, i) => (
                    <li key={i} className="flex gap-2 text-xs leading-relaxed text-paper-600">
                      <span className="mt-1.5 size-1 shrink-0 rounded-full bg-naik-500" />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {signal.cautions.length > 0 ? (
              <div className="mt-4">
                <p className="label mb-2">Perhatikan</p>
                <ul className="space-y-1.5">
                  {signal.cautions.map((c, i) => (
                    <li key={i} className="flex gap-2 text-xs leading-relaxed text-paper-600">
                      <span className="mt-1.5 size-1 shrink-0 rounded-full bg-paper-400" />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          {/* Risk plan */}
          <div className="rounded-lg border border-paper-200 bg-paper-100/50 p-4">
            <p className="label mb-3">Rencana trading</p>

            <div className="space-y-0">
              <PlanRow
                label="Zona entry"
                value={`${formatPrice(signal.risk.entryLow)} – ${formatPrice(signal.risk.entryHigh)}`}
              />
              <PlanRow
                label={isBuy ? "Stop loss" : "Stop (cover)"}
                value={formatPrice(signal.risk.stopLoss)}
                tone="down"
                hint={`-${signal.risk.stopDistancePercent}% dari entry`}
              />
              <PlanRow
                label="Target 1"
                value={formatPrice(signal.risk.takeProfit1)}
                tone="up"
                hint={`R:R ${formatNumber(signal.risk.riskReward)}`}
              />
              <PlanRow label="Target 2" value={formatPrice(signal.risk.takeProfit2)} tone="up" />
              <PlanRow label="Target 3" value={formatPrice(signal.risk.takeProfit3)} tone="up" />
              {signal.risk.atr ? (
                <PlanRow
                  label="ATR(14)"
                  value={formatPrice(signal.risk.atr)}
                  hint={`${formatNumber((technical.atrPercent ?? 0))}% dari harga`}
                />
              ) : null}
              {signal.risk.suggestedLot > 0 ? (
                <PlanRow
                  label="Saran posisi"
                  value={`${signal.risk.suggestedLot} lot`}
                  hint={`~${formatIDR(signal.risk.suggestedLot * 100 * signal.risk.entry)} modal, risiko ${formatIDR(signal.risk.suggestedLot * signal.risk.riskPerLot)}`}
                />
              ) : null}
            </div>

            <p className="mt-4 border-t border-paper-200 pt-3 text-[0.625rem] leading-relaxed text-paper-500">
             Ukuran posisi dihitung untuk modal Rp 10 juta dengan risiko 2% per transaksi. Sesuaikan
              dengan modal dan toleransi risiko Anda sendiri.
            </p>
          </div>
        </div>
      </Card>

      {/* ------------------------------ Chart ------------------------------ */}
      <Card>
        <CardHeader
          title="Pergerakan harga"
          subtitle={`Candlestick harian · volume ${formatCompactInt(analysis.volume)} · rata-rata ${formatCompactInt(analysis.averageVolume)}`}
        />
        <div className="p-5">
          <PriceChart
            candles={analysis.candles}
            overlays={overlays}
            levels={levels}
            height={340}
          />
        </div>
      </Card>

      {/* -------------------- Technical & fundamental ----------------------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <TechnicalCard analysis={analysis} />
        <FundamentalCard analysis={analysis} />
      </div>

      {/* ---------------------------- Indicator grid ----------------------- */}
      <IndicatorGrid analysis={analysis} />

      {/* ----------------------------- Disclaimer -------------------------- */}
      <p className="text-[0.625rem] leading-relaxed text-paper-400">
        Analisis dihitung otomatis dari data harga dan laporan keuangan publik. Nilai historis
        tidak menjamin hasil di masa depan. Bukan nasihat keuangan, fiduciary, atau ajakan
        bertransaksi. Lakukan riset mandiri sebelum mengambil keputusan.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Sub-components                                */
/* -------------------------------------------------------------------------- */

function ScoreRow({
  label,
  score,
  weight,
  detail,
}: {
  label: string;
  score: number;
  weight: string;
  detail: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-paper-700">{label}</span>
        <span className="flex items-baseline gap-2">
          <span className="text-[0.625rem] text-paper-400">{weight}</span>
          <span
            className={`tnum text-sm font-semibold ${
              score > 15 ? "up" : score < -15 ? "down" : "flat"
            }`}
          >
            {score > 0 ? "+" : ""}
            {score.toFixed(0)}
          </span>
        </span>
      </div>
      <div className="mt-1.5">
        <ScoreBar score={score} />
      </div>
      <p className="mt-1 text-[0.625rem] text-paper-400">{detail}</p>
    </div>
  );
}

function PlanRow({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "up" | "down";
}) {
  const toneClass =
    tone === "up" ? "text-naik-600" : tone === "down" ? "text-turun-600" : "text-paper-900";
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-paper-200/70 py-2 last:border-b-0">
      <span className="text-xs text-paper-600">
        {label}
        {hint ? <span className="ml-1.5 text-[0.625rem] text-paper-400">{hint}</span> : null}
      </span>
      <span className={`tnum shrink-0 text-sm font-semibold ${toneClass}`}>{value}</span>
    </div>
  );
}

function TechnicalCard({ analysis }: { analysis: StockAnalysis }) {
  const { technical: t } = analysis;
  const verdicts = [...t.verdicts].sort((a, b) => Math.abs(b.score) - Math.abs(a.score));

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Analisis teknikal"
        subtitle={`Keyakinan ${t.confidence.toFixed(0)}% · ${t.trend}`}
        action={
          <span
            className={`tnum text-lg font-semibold ${
              t.score > 15 ? "up" : t.score < -15 ? "down" : "flat"
            }`}
          >
            {t.score > 0 ? "+" : ""}
            {t.score.toFixed(0)}
          </span>
        }
      />
      {verdicts.length === 0 ? (
        <EmptyState title="Indikator belum tersedia" description="Perlu riwayat harga lebih panjang." />
      ) : (
        <ul className="divide-y divide-paper-100">
          {verdicts.map((v) => (
            <li key={v.key} className="flex items-start gap-3 px-5 py-3">
              <span className="mt-1">
                <BiasDot bias={v.bias} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-paper-800">{v.label}</span>
                <span className="mt-0.5 block text-[0.6875rem] leading-relaxed text-paper-500">
                  {v.detail}
                </span>
              </span>
              <span
                className={`tnum shrink-0 text-xs font-semibold ${
                  v.score > 15 ? "up" : v.score < -15 ? "down" : "flat"
                }`}
              >
                {v.score > 0 ? "+" : ""}
                {v.score.toFixed(0)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function FundamentalCard({ analysis }: { analysis: StockAnalysis }) {
  const { fundamental: f } = analysis;

  if (!f.available) {
    return (
      <Card className="flex flex-col">
        <CardHeader title="Analisis fundamental" subtitle="Data laporan keuangan tidak tersedia" />
        <EmptyState
          title="Fundamental tidak tersedia"
          description="Penyedia data publik belum memuat laporan keuangan untuk saham ini, sehingga skor hanya berbasis teknikal."
        />
      </Card>
    );
  }

  const verdicts = [...f.verdicts].sort((a, b) => Math.abs(b.score) - Math.abs(a.score));

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Analisis fundamental"
        subtitle={`Laporan ${formatReportPeriod(f.period)} · cakupan ${f.coverage.toFixed(0)}%`}
        action={
          <span
            className={`tnum text-lg font-semibold ${
              f.score > 15 ? "up" : f.score < -15 ? "down" : "flat"
            }`}
          >
            {f.score > 0 ? "+" : ""}
            {f.score.toFixed(0)}
          </span>
        }
      />
      {verdicts.length === 0 ? (
        <EmptyState title="Rasio belum dapat dihitung" />
      ) : (
        <ul className="divide-y divide-paper-100">
          {verdicts.map((v) => (
            <li key={v.key} className="flex items-start gap-3 px-5 py-3">
              <span className="mt-1">
                <BiasDot bias={v.bias} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-paper-800">{v.label}</span>
                <span className="mt-0.5 block text-[0.6875rem] leading-relaxed text-paper-500">
                  {v.detail}
                </span>
              </span>
              <span
                className={`tnum shrink-0 text-xs font-semibold ${
                  v.score > 15 ? "up" : v.score < -15 ? "down" : "flat"
                }`}
              >
                {v.score > 0 ? "+" : ""}
                {v.score.toFixed(0)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function IndicatorGrid({ analysis }: { analysis: StockAnalysis }) {
  const { technical: t, fundamental: f } = analysis;

  const ma = [
    { label: "MA20", value: t.sma20 },
    { label: "MA50", value: t.sma50 },
    { label: "MA200", value: t.sma200 },
  ];
  const osc = [
    { label: "RSI(14)", value: t.rsi14, fmt: (v: number) => v.toFixed(1), zone: rsiZone(t.rsi14) },
    { label: "MACD", value: t.macd, fmt: (v: number) => v.toFixed(2) },
    { label: "Stoch %K", value: t.stochK, fmt: (v: number) => v.toFixed(1) },
    { label: "%B", value: t.bbPercentB, fmt: (v: number) => v.toFixed(2) },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Moving average" subtitle="Posisi harga terhadap rata-rata bergerak" />
        <div className="px-5 py-2">
          {ma.map((m) => (
            <MetricRow
              key={m.label}
              label={m.label}
              value={m.value !== null ? formatPrice(m.value) : "-"}
              tone={
                m.value === null
                  ? "flat"
                  : analysis.price > m.value
                    ? "up"
                    : "down"
              }
              hint={m.value === null ? undefined : analysis.price > m.value ? "harga di atas" : "harga di bawah"}
            />
          ))}
          <MetricRow
            label="Posisi 52 minggu"
            value={t.rangePosition !== null ? `${t.rangePosition.toFixed(0)}%` : "-"}
            tone={
              t.rangePosition === null
                ? "flat"
                : t.rangePosition > 70
                  ? "down"
                  : t.rangePosition < 30
                    ? "up"
                    : "flat"
            }
            hint={t.rangePosition !== null ? "0=bawah 52M · 100=atas 52M" : undefined}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="Osilator & momentum" subtitle="Kondisi pasar jangka pendek" />
        <div className="px-5 py-2">
          {osc.map((o) => (
            <MetricRow
              key={o.label}
              label={o.label}
              value={o.value !== null ? o.fmt(o.value) : "-"}
              tone={o.zone ?? "flat"}
              hint={o.zone === "up" ? "zona bawah" : o.zone === "down" ? "zona atas" : undefined}
            />
          ))}
          <MetricRow
            label="Momentum 20 hari"
            value={t.roc20 !== null ? formatSigned(t.roc20) : "-"}
            tone={t.roc20 === null ? "flat" : t.roc20 > 0 ? "up" : t.roc20 < 0 ? "down" : "flat"}
          />
          <MetricRow
            label="Volume relatif"
            value={t.relativeVolume !== null ? `${t.relativeVolume.toFixed(2)}x` : "-"}
            tone={t.relativeVolume === null ? "flat" : t.relativeVolume > 1.2 ? "up" : "flat"}
            hint={t.relativeVolume === null ? undefined : "vs rata-rata 20 hari"}
          />
          <MetricRow label="ADX(14)" value={t.adx !== null ? t.adx.toFixed(1) : "-"} />
        </div>
      </Card>

      {f.available ? (
        <Card>
          <CardHeader
            title="Rasio valuasi"
            subtitle={`Berdasarkan laporan ${formatReportPeriod(f.period)}`}
          />
          <div className="px-5 py-2">
            <MetricRow
              label="PER"
              value={f.valuation.pe !== null ? `${formatNumber(f.valuation.pe)}x` : "-"}
              tone={toneFrom(f.valuation.pe, 12, 25)}
              hint="murah < 12x"
            />
            <MetricRow
              label="PBV"
              value={f.valuation.pb !== null ? `${formatNumber(f.valuation.pb)}x` : "-"}
              tone={toneFrom(f.valuation.pb, 1.5, 4)}
              hint="murah < 1.5x"
            />
            <MetricRow
              label="PSR"
              value={f.valuation.ps !== null ? `${formatNumber(f.valuation.ps)}x` : "-"}
              tone={toneFrom(f.valuation.ps, 2, 8)}
            />
            <MetricRow
              label="EV/EBIT"
              value={
                f.valuation.evEbitda !== null ? `${formatNumber(f.valuation.evEbitda)}x` : "-"
              }
              tone={toneFrom(f.valuation.evEbitda, 8, 20)}
            />
            <MetricRow
              label="Kapitalisasi pasar"
              value={formatIDR(f.metrics.find((m) => m.key === "mcap")?.value ?? null)}
            />
          </div>
        </Card>
      ) : null}

      {f.available ? (
        <Card>
          <CardHeader title="Pertumbuhan & kesehatan" subtitle="Tren pendapatan dan neraca" />
          <div className="px-5 py-2">
            <MetricRow
              label="Pendapatan YoY"
              value={f.growth.revenueYoY !== null ? formatSigned(f.growth.revenueYoY) : "-"}
              tone={
                f.growth.revenueYoY === null
                  ? "flat"
                  : f.growth.revenueYoY > 0
                    ? "up"
                    : "down"
              }
            />
            <MetricRow
              label="Laba bersih YoY"
              value={f.growth.netIncomeYoY !== null ? formatSigned(f.growth.netIncomeYoY) : "-"}
              tone={
                f.growth.netIncomeYoY === null
                  ? "flat"
                  : f.growth.netIncomeYoY > 0
                    ? "up"
                    : "down"
              }
            />
            <MetricRow
              label="ROE"
              value={f.profitability.roe !== null ? `${formatNumber(f.profitability.roe)}%` : "-"}
              tone={toneFrom(f.profitability.roe, 12, 0)}
              hint="baik > 15%"
            />
            <MetricRow
              label="DER"
              value={
                f.health.debtToEquity !== null ? `${formatNumber(f.health.debtToEquity)}x` : "-"
              }
              tone={toneFrom(f.health.debtToEquity, 1, 2.5, true)}
              hint="aman < 1x"
            />
            <MetricRow
              label="Current ratio"
              value={
                f.health.currentRatio !== null ? `${formatNumber(f.health.currentRatio)}x` : "-"
              }
              tone={toneFrom(f.health.currentRatio, 1.2, 0.8)}
              hint="aman > 1.2x"
            />
            <MetricRow
              label="Margin bersih"
              value={
                f.profitability.netMargin !== null
                  ? `${formatNumber(f.profitability.netMargin)}%`
                  : "-"
              }
              tone={toneFrom(f.profitability.netMargin, 12, 0)}
            />
          </div>
        </Card>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                    */
/* -------------------------------------------------------------------------- */

function rsiZone(v: number | null): "up" | "down" | "flat" {
  if (v === null) return "flat";
  if (v <= 30) return "up";
  if (v >= 70) return "down";
  return "flat";
}

/** Map a ratio to a tone: lower-than `good` is up, higher-than `bad` is down. */
function toneFrom(
  value: number | null,
  good: number,
  bad: number,
  lowerIsBetter = false,
): "up" | "down" | "flat" {
  if (value === null || !Number.isFinite(value)) return "flat";
  if (lowerIsBetter) {
    if (value <= good) return "up";
    if (value >= bad) return "down";
    return "flat";
  }
  if (value >= good) return "up";
  if (value <= bad) return "down";
  return "flat";
}