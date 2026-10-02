"use client";

import { useMemo, useState } from "react";

import { formatChartDate, formatPrice } from "@/lib/format";

export interface ChartCandle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface ChartOverlay {
  label: string;
  values: Array<number | null>;
  color: string;
  width?: number;
  dashed?: boolean;
}

type Range = 1 | 3 | 6 | 12;

const RANGES: Array<{ key: Range; label: string; bars: number }> = [
  { key: 1, label: "1B", bars: 22 },
  { key: 3, label: "3B", bars: 66 },
  { key: 6, label: "6B", bars: 132 },
  { key: 12, label: "12B", bars: 252 },
];

interface PriceChartProps {
  candles: ChartCandle[];
  overlays?: ChartOverlay[];
  /** Horizontal reference lines, e.g. stop loss and take profit. */
  levels?: Array<{ price: number; label: string; color: string }>;
  height?: number;
  showVolume?: boolean;
  title?: string;
}

/**
 * Dependency-free SVG candlestick chart.
 *
 * Deliberately hand-rolled: a charting library would add far more weight than
 * this view needs, and the data is a simple OHLC array.
 */
export function PriceChart({
  candles,
  overlays = [],
  levels = [],
  height = 320,
  showVolume = true,
  title,
}: PriceChartProps) {
  const [range, setRange] = useState<Range>(6);

  const view = useMemo(() => {
    const bars = RANGES.find((r) => r.key === range)?.bars ?? 132;
    return candles.slice(-bars);
  }, [candles, range]);

  const geometry = useMemo(() => {
    if (view.length === 0) return null;

    const padL = 8;
    const padR = 56; // room for the right-hand price axis
    const padT = 10;
    const padB = 22;
    const volumeH = showVolume ? Math.round(height * 0.18) : 0;
    const priceH = height - padT - padB - volumeH - 8;

    let min = Infinity;
    let max = -Infinity;
    for (const c of view) {
      min = Math.min(min, c.l);
      max = Math.max(max, c.h);
    }
    // Include overlay values so lines are never clipped off-canvas.
    const overlayTail = overlays[0]?.values.slice(-view.length) ?? [];
    for (const v of overlayTail) {
      if (v === null || v === undefined || !Number.isFinite(v)) continue;
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    for (const l of levels) {
      if (l.price > 0 && l.price < max * 1.6) {
        min = Math.min(min, l.price);
        max = Math.max(max, l.price);
      }
    }

    const pad = (max - min) * 0.06 || max * 0.02 || 1;
    min -= pad;
    max += pad;

    const plotW = 1000;
    const scaleX = (i: number) =>
      view.length <= 1 ? padL : padL + (i / (view.length - 1)) * (plotW - padL - padR);
    const scaleY = (p: number) => padT + (1 - (p - min) / (max - min)) * priceH;

    const maxVol = Math.max(...view.map((c) => c.v), 1);
    const volTop = padT + priceH + 8;
    const scaleVol = (v: number) => (v / maxVol) * volumeH;

    // Gridlines + axis labels on a "nice" interval.
    const ticks = niceTicks(min, max, 5);
    const xTickIdx = xTickIndices(view.length, plotW - padL - padR);

    return {
      padL,
      padR,
      padT,
      padB,
      priceH,
      volumeH,
      volTop,
      plotW,
      min,
      max,
      scaleX,
      scaleY,
      scaleVol,
      maxVol,
      ticks,
      xTickIdx,
    };
  }, [view, overlays, levels, height, showVolume]);

  if (view.length === 0 || !geometry) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-paper-300 text-sm text-paper-400"
        style={{ height }}
      >
        Belum ada data harga.
      </div>
    );
  }

  const g = geometry;
  const slot = g.plotW - g.padL - g.padR;
  // Candle bodies need a minimum width so single-pixel candles stay visible.
  const bodyW = Math.max(1.2, Math.min(9, (slot / view.length) * 0.62));

  const last = view[view.length - 1];
  const lastY = g.scaleY(last.c);

  const overlayPaths = overlays.map((ov) => {
    const segs: string[] = [];
    let started = false;
    ov.values.slice(-view.length).forEach((v, i) => {
      if (v === null || v === undefined || !Number.isFinite(v)) {
        started = false;
        return;
      }
      const x = g.scaleX(i);
      const y = g.scaleY(v);
      if (!started) {
        segs.push(`M ${x.toFixed(1)} ${y.toFixed(1)}`);
        started = true;
      } else {
        segs.push(`L ${x.toFixed(1)} ${y.toFixed(1)}`);
      }
    });
    return { ...ov, d: segs.join(" ") };
  });

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        {title ? <p className="text-xs font-medium text-paper-600">{title}</p> : <span />}
        <div className="flex items-center gap-3">
          {overlays.length > 0 ? (
            <div className="hidden items-center gap-2.5 sm:flex">
              {overlays.map((ov) => (
                <span key={ov.label} className="flex items-center gap-1 text-[0.6875rem] text-paper-500">
                  <span
                    className="inline-block h-0.5 w-3.5 rounded-full"
                    style={{ backgroundColor: ov.color }}
                  />
                  {ov.label}
                </span>
              ))}
            </div>
          ) : null}
          <div className="flex rounded-lg border border-paper-200 bg-paper-100 p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRange(r.key)}
                aria-pressed={range === r.key}
                className={`rounded-[0.4rem] px-2 py-0.5 text-[0.6875rem] font-medium transition-colors ${
                  range === r.key
                    ? "bg-white text-paper-900 shadow-sm"
                    : "text-paper-500 hover:text-paper-800"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-lg bg-white">
        <svg
          viewBox={`0 0 ${g.plotW} ${height}`}
          className="block w-full"
          style={{ height }}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Grafik harga, ${view.length} periode`}
        >
          {/* Horizontal gridlines + price axis */}
          {g.ticks.map((t) => (
            <g key={t}>
              <line
                x1={g.padL}
                x2={g.plotW - g.padR}
                y1={g.scaleY(t)}
                y2={g.scaleY(t)}
                className="grid-line"
                strokeDasharray="2 4"
              />
              <text
                x={g.plotW - g.padR + 6}
                y={g.scaleY(t) + 3}
                className="axis-text"
              >
                {compact(t)}
              </text>
            </g>
          ))}

          {/* Reference levels (stop loss / take profit) */}
          {levels.map((l) => {
            const y = g.scaleY(l.price);
            if (y < g.padT || y > g.padT + g.priceH) return null;
            return (
              <g key={l.label}>
                <line
                  x1={g.padL}
                  x2={g.plotW - g.padR}
                  y1={y}
                  y2={y}
                  stroke={l.color}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                  opacity={0.75}
                />
                <text
                  x={g.padL + 3}
                  y={y - 3}
                  fontSize={9}
                  fill={l.color}
                  fontWeight={600}
                >
                  {l.label} {formatPrice(l.price)}
                </text>
              </g>
            );
          })}

          {/* Volume */}
          {showVolume
            ? view.map((c, i) => {
                const x = g.scaleX(i);
                const h = Math.max(0.5, g.scaleVol(c.v));
                return (
                  <rect
                    key={`v${c.t}`}
                    x={x - bodyW / 2}
                    y={g.volTop + g.volumeH - h}
                    width={bodyW}
                    height={h}
                    fill={c.c >= c.o ? "var(--color-naik-200)" : "var(--color-turun-200)"}
                    opacity={0.55}
                  />
                );
              })
            : null}

          {/* Candles */}
          {view.map((c, i) => {
            const x = g.scaleX(i);
            const up = c.c >= c.o;
            const yO = g.scaleY(c.o);
            const yC = g.scaleY(c.c);
            const top = Math.min(yO, yC);
            const h = Math.max(1, Math.abs(yC - yO));
            const wickX = Math.round(x * 10) / 10;

            return (
              <g key={c.t}>
                <line
                  x1={wickX}
                  x2={wickX}
                  y1={g.scaleY(c.h)}
                  y2={g.scaleY(c.l)}
                  stroke={up ? "var(--color-naik-500)" : "var(--color-turun-500)"}
                  strokeWidth={1}
                />
                <rect
                  x={x - bodyW / 2}
                  y={top}
                  width={bodyW}
                  height={h}
                  fill={up ? "var(--color-naik-500)" : "var(--color-turun-500)"}
                  rx={bodyW > 3 ? 0.5 : 0}
                />
              </g>
            );
          })}

          {/* Moving-average overlays */}
          {overlayPaths.map((ov) =>
            ov.d ? (
              <path
                key={ov.label}
                d={ov.d}
                fill="none"
                stroke={ov.color}
                strokeWidth={ov.width ?? 1.4}
                strokeDasharray={ov.dashed ? "4 3" : undefined}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null,
          )}

          {/* Live price marker */}
          <g>
            <line
              x1={g.padL}
              x2={g.plotW - g.padR}
              y1={lastY}
              y2={lastY}
              stroke={last.c >= last.o ? "var(--color-naik-500)" : "var(--color-turun-500)"}
              strokeWidth={1}
              strokeDasharray="3 3"
              opacity={0.6}
            />
            <rect
              x={g.plotW - g.padR + 1}
              y={lastY - 8}
              width={52}
              height={16}
              rx={3}
              fill={last.c >= last.o ? "var(--color-naik-600)" : "var(--color-turun-600)"}
            />
            <text
              x={g.plotW - g.padR + 5}
              y={lastY + 3.5}
              fontSize={9.5}
              fill="#fff"
              fontWeight={700}
            >
              {compact(last.c)}
            </text>
          </g>

          {/* X axis dates */}
          {g.xTickIdx.map((i) => (
            <text
              key={`x${i}`}
              x={g.scaleX(i)}
              y={height - 6}
              className="axis-text"
              textAnchor={i === 0 ? "start" : i === view.length - 1 ? "end" : "middle"}
            >
              {formatChartDate(view[i].t)}
            </text>
          ))}
        </svg>
      </div>

      {showVolume ? (
        <p className="mt-1 text-right text-[0.625rem] text-paper-400">
          Volume: {view[view.length - 1].v.toLocaleString("id-ID")} lot terakhir
        </p>
      ) : null}
    </div>
  );
}

/** Round axis interval to a human-friendly step (1/2/5 x 10^n). */
function niceTicks(min: number, max: number, count: number): number[] {
  const range = max - min;
  if (!Number.isFinite(range) || range <= 0) return [min];

  const rough = range / count;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / mag;
  const step = (norm >= 7.5 ? 10 : norm >= 3.5 ? 5 : norm >= 1.5 ? 2 : 1) * mag;

  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max; v += step) {
    out.push(Math.round(v * 1000) / 1000);
  }
  return out;
}

/** Pick evenly spaced x-axis label positions, avoiding crowding. */
function xTickIndices(length: number, plotWidth: number): number[] {
  if (length <= 1) return [0];
  const target = Math.max(2, Math.min(7, Math.floor(plotWidth / 110)));
  const step = Math.max(1, Math.floor((length - 1) / (target - 1)));
  const out: number[] = [];
  for (let i = 0; i < length; i += step) out.push(i);
  if (out[out.length - 1] !== length - 1) out.push(length - 1);
  return out;
}

/** 61.000 -> "61rb", 1.250.000 -> "1,25jt" */
function compact(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e6) return `${(v / 1e6).toFixed(abs >= 1e7 ? 1 : 2).replace(".", ",")}jt`;
  if (abs >= 1e4) return `${Math.round(v / 1e3)}rb`;
  return Math.round(v).toLocaleString("id-ID");
}
