import type { ReactNode } from "react";

import type { SignalTier } from "@/lib/signal";
import { TIER_META } from "@/lib/signal";

/* -------------------------------------------------------------------------- */
/*                                   Layout                                    */
/* -------------------------------------------------------------------------- */

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="card-header">
      <div className="min-w-0">
        <h2 className="card-title truncate">{title}</h2>
        {subtitle ? (
          <p className="mt-0.5 truncate text-xs text-paper-500">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Badges                                    */
/* -------------------------------------------------------------------------- */

export function SignalBadge({ tier, size = "sm" }: { tier: SignalTier; size?: "sm" | "md" }) {
  const meta = TIER_META[tier];
  const toneClass = {
    "strong-buy": "badge-strong-buy",
    buy: "badge-buy",
    neutral: "badge-neutral",
    sell: "badge-sell",
    "strong-sell": "badge-strong-sell",
  }[meta.tone];

  return (
    <span className={toneClass} title={`Skor gabungan: ${tier}`}>
      {meta.label}
      {size === "md" ? <span className="ml-1 opacity-70">·</span> : null}
    </span>
  );
}

export function BiasDot({ bias }: { bias: "bullish" | "bearish" | "neutral" }) {
  const color =
    bias === "bullish"
      ? "bg-naik-500"
      : bias === "bearish"
        ? "bg-turun-500"
        : "bg-paper-400";
  return <span className={`inline-block size-1.5 shrink-0 rounded-full ${color}`} aria-hidden />;
}

export function TrendTag({ trend }: { trend: "uptrend" | "downtrend" | "sideways" }) {
  const map: Record<string, { text: string; cls: string }> = {
    uptrend: { text: "Tren Naik", cls: "bg-naik-50 text-naik-700 ring-naik-200" },
    downtrend: { text: "Tren Turun", cls: "bg-turun-50 text-turun-700 ring-turun-200" },
    sideways: { text: "Sideways", cls: "bg-paper-100 text-paper-600 ring-paper-300" },
  };

  // Rendered inside rows that poll live data, so an unrecognised value must
  // degrade to a neutral tag rather than throw and blank the whole page.
  const style = map[trend] ?? map.sideways;

  return <span className={`badge ring-1 ring-inset ${style.cls}`}>{style.text}</span>;
}

/* -------------------------------------------------------------------------- */
/*                                Score visual                                 */
/* -------------------------------------------------------------------------- */

/**
 * Diverging bar: negative fills left from centre, positive fills right.
 * The scale is fixed at -100..100 so scores are visually comparable.
 */
export function ScoreBar({
  score,
  height = "h-1.5",
  showTrack = true,
}: {
  score: number;
  height?: string;
  showTrack?: boolean;
}) {
  const clamped = Math.max(-100, Math.min(100, score));
  const magnitude = Math.abs(clamped) / 2; // percentage from centre
  const positive = clamped >= 0;

  return (
    <div
      className={`relative w-full overflow-hidden rounded-full bg-paper-200 ${showTrack ? height : ""}`}
      role="img"
      aria-label={`Skor ${clamped.toFixed(0)} dari 100`}
    >
      {/* Centre tick */}
      <span className="absolute left-1/2 top-0 h-full w-px bg-paper-400/70" aria-hidden />
      <span
        className={`absolute top-0 h-full rounded-full ${
          positive ? "bg-naik-500" : "bg-turun-500"
        }`}
        style={
          positive
            ? { left: "50%", width: `${magnitude}%` }
            : { right: "50%", width: `${magnitude}%` }
        }
      />
    </div>
  );
}

/** Compact numeric score with colour coding. */
export function ScoreValue({ score, suffix = "" }: { score: number | null; suffix?: string }) {
  if (score === null || !Number.isFinite(score)) {
    return <span className="tnum text-paper-400">-</span>;
  }
  const tone = score > 15 ? "up" : score < -15 ? "down" : "flat";
  return (
    <span className={`tnum font-medium ${tone}`}>
      {score > 0 ? "+" : ""}
      {score.toFixed(0)}
      {suffix}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Stat tiles                                 */
/* -------------------------------------------------------------------------- */

export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "neutral" | "up" | "down";
}) {
  const toneClass =
    tone === "up" ? "text-naik-600" : tone === "down" ? "text-turun-600" : "text-paper-900";
  return (
    <div className="min-w-0 px-5 py-4">
      <p className="label">{label}</p>
      <p className={`tnum mt-1.5 font-display text-xl font-semibold ${toneClass}`}>{value}</p>
      {hint ? <p className="mt-0.5 truncate text-xs text-paper-500">{hint}</p> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Data presentation                              */
/* -------------------------------------------------------------------------- */

export function PriceChange({
  price,
  change,
  percent,
  size = "md",
}: {
  price: number;
  change?: number | null;
  percent?: number | null;
  size?: "sm" | "md" | "lg";
}) {
  const pct = percent ?? 0;
  const delta = change ?? 0;
  const tone = pct > 0.0001 ? "up" : pct < -0.0001 ? "down" : "flat";
  const arrow = pct > 0.0001 ? "▲" : pct < -0.0001 ? "▼" : "—";

  const priceSize =
    size === "lg"
      ? "text-3xl"
      : size === "sm"
        ? "text-sm"
        : "text-base";
  const deltaSize = size === "lg" ? "text-sm" : "text-xs";

  return (
    <div className="flex flex-col">
      <span className={`tnum font-display font-semibold ${priceSize} ${tone}`}>
        {Math.round(price).toLocaleString("id-ID")}
      </span>
      {change !== undefined && percent !== undefined ? (
        <span className={`tnum mt-0.5 font-medium ${deltaSize} ${tone}`}>
          {arrow} {delta > 0 ? "+" : ""}
          {delta.toLocaleString("id-ID", { maximumFractionDigits: 0 })} (
          {pct > 0 ? "+" : ""}
          {pct.toFixed(2).replace(".", ",")}%)
        </span>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-paper-100">
        <svg
          viewBox="0 0 24 24"
          className="size-5 text-paper-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <path d="M3 3v18h18" />
          <path d="m7 14 3-3 3 3 4-5" />
        </svg>
      </div>
      <p className="font-display text-sm font-semibold text-paper-800">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-paper-500">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Horizontal meter used for confidence and ratio bands. */
export function Meter({
  value,
  max = 100,
  tone = "accent",
}: {
  value: number | null;
  max?: number;
  tone?: "accent" | "up" | "down" | "paper";
}) {
  if (value === null || !Number.isFinite(value)) {
    return <div className="h-1 w-full rounded-full bg-paper-200" />;
  }
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const color =
    tone === "up"
      ? "bg-naik-500"
      : tone === "down"
        ? "bg-turun-500"
        : tone === "paper"
          ? "bg-paper-400"
          : "bg-accent-500";
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-paper-200">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Definition-style row used in metric tables. */
export function MetricRow({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "up" | "down" | "flat";
}) {
  const toneClass =
    tone === "up" ? "text-naik-600" : tone === "down" ? "text-turun-600" : "text-paper-800";
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-paper-100 py-2 last:border-b-0">
      <span className="text-xs text-paper-600">
        {label}
        {hint ? <span className="ml-1 text-[0.625rem] text-paper-400">{hint}</span> : null}
      </span>
      <span className={`tnum shrink-0 text-sm font-medium ${toneClass}`}>{value}</span>
    </div>
  );
}
