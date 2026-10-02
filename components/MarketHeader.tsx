import type { MarketStatus } from "@/lib/market";
import { Card } from "./ui";
import { formatSigned, formatPrice } from "@/lib/format";

interface IhsgSummary {
  price: number;
  changePercent: number;
  change: number;
  dayHigh: number;
  dayLow: number;
  lastTradeAt: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
}

interface Overview {
  status: MarketStatus;
  ihsg: {
    price: number;
    change: number;
    changePercent: number;
    dayHigh: number;
    dayLow: number;
    lastTradeAt: number | null;
    fiftyTwoWeekHigh: number | null;
    fiftyTwoWeekLow: number | null;
    candles: Array<{ t: number; c: number }>;
  } | null;
}

export function MarketHeader({ overview }: { overview: Overview }) {
  const { status, ihsg } = overview;
  const summary: IhsgSummary | null = ihsg
    ? {
        price: ihsg.price,
        changePercent: ihsg.changePercent,
        change: ihsg.change,
        dayHigh: ihsg.dayHigh,
        dayLow: ihsg.dayLow,
        lastTradeAt: ihsg.lastTradeAt,
        fiftyTwoWeekHigh: ihsg.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: ihsg.fiftyTwoWeekLow,
      }
    : null;

  const spark = ihsg ? buildSparkline(ihsg.candles.slice(-60).map((c) => c.c)) : null;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        {/* IHSG ------------------------------------------------------- */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="label">Indeks Harga Saham Gabungan</p>
            <span
              className={`size-1.5 rounded-full ${status.isOpen ? "live-dot bg-naik-500" : "bg-paper-400"}`}
              title={status.isOpen ? "Pasar buka" : "Pasar tutup"}
            />
          </div>

          {summary ? (
            <>
              <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span
                  className={`tnum font-display text-3xl font-semibold tracking-tight sm:text-4xl ${
                    summary.changePercent > 0
                      ? "up"
                      : summary.changePercent < 0
                        ? "down"
                        : "flat"
                  }`}
                >
                  {summary.price.toLocaleString("id-ID", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
                <span
                  className={`tnum text-sm font-medium ${
                    summary.changePercent > 0
                      ? "up"
                      : summary.changePercent < 0
                        ? "down"
                        : "flat"
                  }`}
                >
                  {summary.change > 0 ? "+" : ""}
                  {summary.change.toFixed(2).replace(".", ",")} ·{" "}
                  {formatSigned(summary.changePercent)}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.6875rem] text-paper-500">
                <span className="tnum">
                  H <span className="font-medium text-paper-700">{formatPrice(summary.dayHigh)}</span>
                </span>
                <span className="tnum">
                  L <span className="font-medium text-paper-700">{formatPrice(summary.dayLow)}</span>
                </span>
                {summary.fiftyTwoWeekHigh ? (
                  <span className="tnum">
                    52T{" "}
                    <span className="font-medium text-paper-700">
                      {formatPrice(summary.fiftyTwoWeekHigh)}
                    </span>
                  </span>
                ) : null}
                {summary.fiftyTwoWeekLow ? (
                  <span className="tnum">
                    52B{" "}
                    <span className="font-medium text-paper-700">
                      {formatPrice(summary.fiftyTwoWeekLow)}
                    </span>
                  </span>
                ) : null}
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-paper-400">Data indeks sedang dimuat...</p>
          )}
        </div>

        {/* Sparkline + session ---------------------------------------- */}
        <div className="flex shrink-0 items-end gap-5">
          {spark ? (
            <div className="hidden sm:block">
              <Sparkline points={spark.points} rising={spark.rising} />
              <p className="mt-1 text-center text-[0.625rem] text-paper-400">
                60 hari bursa
              </p>
            </div>
          ) : null}

          <div className="rounded-lg border border-paper-200 bg-paper-100/60 px-4 py-3 text-right">
            <p className="text-[0.6875rem] font-medium text-paper-700">{status.label}</p>
            <p className="tnum mt-0.5 font-display text-lg font-semibold text-paper-900">
              {status.wibTime}
            </p>
            <p className="mt-0.5 text-[0.625rem] text-paper-500">
              {status.wibWeekday}, {formatDateId(status.wibDate)}
            </p>
            {status.nextChangeAt ? (
              <p className="mt-1 text-[0.625rem] text-paper-400">
                Berikutnya {status.nextChangeAt}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function buildSparkline(values: number[]): { points: string; rising: boolean } | null {
  if (values.length < 2) return null;

  const w = 140;
  const h = 40;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return { points, rising: values[values.length - 1] >= values[0] };
}

function Sparkline({ points, rising }: { points: string; rising: boolean }) {
  const color = rising ? "var(--color-naik-500)" : "var(--color-turun-500)";
  const id = rising ? "spark-up" : "spark-down";

  return (
    <svg viewBox={`0 0 140 40`} className="h-10 w-36" role="img" aria-label="Tren 60 hari IHSG">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,40 ${points} 140,40`} fill={`url(#${id})`} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

function formatDateId(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}
