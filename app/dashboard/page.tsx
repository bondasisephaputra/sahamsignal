import Link from "next/link";
import { Suspense } from "react";

import { getMarketOverview, screenUniverse, recordSignals } from "@/lib/analysis";
import { Card, CardHeader, EmptyState } from "@/components/ui";
import { MarketHeader as MarketHeaderView } from "@/components/MarketHeader";
import { LiveTopSignals, type SignalRow } from "@/components/LiveTopSignals";
import { formatSigned, formatPrice } from "@/lib/format";
import type { StockAnalysis } from "@/lib/analysis";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * The cold-cache screen is heavy (~150 upstream requests on first run), so the
 * shell renders immediately and each heavy section streams in behind a
 * skeleton. Subsequent loads are served from the SQLite cache.
 */
export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<SkeletonCard className="h-32" />}>
        <MarketSection />
      </Suspense>

      <Suspense fallback={<TopSignalsSkeleton />}>
        <TopSignalsSection />
      </Suspense>

      <Suspense fallback={<WinnersSkeleton />}>
        <WinnersSection />
      </Suspense>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

async function MarketSection() {
  const overview = await getMarketOverview();
  return <MarketHeaderView overview={overview} />;
}

async function TopSignalsSection() {
  const screen = await screenUniverse({ limit: 60 });

  // Daily snapshot for later accuracy review. Best effort, never blocking.
  recordSignals(screen.results).catch(() => {});

  const toRows = (list: StockAnalysis[]): SignalRow[] =>
    list.map((r) => ({
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
      pe: r.fundamental.valuation.pe,
      stopLoss: r.signal.risk.stopLoss,
      takeProfit1: r.signal.risk.takeProfit1,
      generatedAt: r.signal.generatedAt,
    }));

  const buys = screen.results.filter((r) => r.signal.action === "buy");
  const sells = screen.results.filter((r) => r.signal.action === "sell");
  const holds = screen.results.filter((r) => r.signal.action === "hold");

  return (
    <LiveTopSignals
      initialBuy={toRows(buys.slice(0, 5))}
      initialSell={toRows(sells.slice(0, 5))}
      initialHold={toRows(holds.slice(0, 4))}
      counts={{ buy: buys.length, hold: holds.length, sell: sells.length }}
      analysed={screen.analysed}
      failures={screen.failures.length}
      generatedAt={screen.generatedAt}
    />
  );
}

async function WinnersSection() {
  const screen = await screenUniverse({ limit: 200 });

  const sorted = [...screen.results].sort((a, b) => b.changePercent - a.changePercent);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <MoverCard
        title="Pergerakan Tertinggi"
        subtitle="Top gainer di antara saham yang dipindai"
        rows={sorted.slice(0, 5)}
      />
      <MoverCard
        title="Pergerakan Terendah"
        subtitle="Top loser di antara saham yang dipindai"
        rows={sorted.slice(-5).reverse()}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

interface MoverRow {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  changePercent: number;
}

function MoverCard({
  title,
  subtitle,
  rows,
}: {
  title: string;
  subtitle: string;
  rows: StockAnalysis[];
}) {
  const mapped: MoverRow[] = rows.map((r) => ({
    symbol: r.symbol,
    name: r.name,
    sector: r.sector,
    price: r.price,
    changePercent: r.changePercent,
  }));

  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      {mapped.length === 0 ? (
        <EmptyState title="Belum ada data" description="Coba muat ulang sebentar lagi." />
      ) : (
        <ul className="divide-y divide-paper-100">
          {mapped.map((r, i) => (
            <li key={r.symbol}>
              <Link
                href={`/dashboard/saham/${r.symbol}`}
                className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-paper-50"
              >
                <span className="tnum w-4 shrink-0 text-xs font-semibold text-paper-400">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-1.5">
                    <span className="tnum text-sm font-semibold text-paper-900">
                      {r.symbol}
                    </span>
                    <span className="truncate text-xs text-paper-500">{r.name}</span>
                  </span>
                  <span className="mt-0.5 block text-[0.6875rem] text-paper-400">
                    {r.sector}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="tnum block text-sm font-medium text-paper-800">
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
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* -------------------------------- Skeletons -------------------------------- */

function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-xl border border-paper-200 bg-white ${className}`} />
  );
}

function TopSignalsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <SkeletonCard className="h-32" />
      <div className="grid gap-4 lg:grid-cols-2">
        <SkeletonCard className="h-72" />
        <SkeletonCard className="h-72" />
      </div>
    </div>
  );
}

function WinnersSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SkeletonCard className="h-64" />
      <SkeletonCard className="h-64" />
    </div>
  );
}
