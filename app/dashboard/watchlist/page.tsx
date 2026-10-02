import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getSessionUser } from "@/lib/auth";
import { listWatchlist } from "@/lib/watchlist";
import { analyzeSymbol, isAnalysis } from "@/lib/analysis";
import { WatchlistView, type WatchlistEntry } from "@/components/WatchlistView";

export const metadata: Metadata = { title: "Watchlist" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function WatchlistPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const items = await listWatchlist(user.id);

  return (
    <Suspense fallback={<WatchlistSkeleton />}>
      <Loader items={items} />
    </Suspense>
  );
}

async function Loader({ items }: { items: Array<{ id: string; symbol: string }> }) {
  if (items.length === 0) return <WatchlistView entries={[]} />;

  // Analyse each watched symbol; failures degrade to a per-row error state
  // rather than emptying the whole list.
  const analysed = await Promise.all(
    items.map(async (item) => {
      const result = await analyzeSymbol(item.symbol);
      if (!isAnalysis(result)) {
        return { symbol: item.symbol, error: result.reason } satisfies WatchlistEntry;
      }

      const { signal, technical } = result;
      return {
        symbol: result.symbol,
        name: result.name,
        sector: result.sector,
        price: result.price,
        changePercent: result.changePercent,
        volume: result.volume,
        tier: signal.tier,
        action: signal.action,
        score: signal.score,
        confidence: signal.confidence,
        trend: technical.trend,
        rsi: technical.rsi14,
        stopLoss: signal.risk.stopLoss,
        takeProfit1: signal.risk.takeProfit1,
        updatedAt: signal.generatedAt,
        error: null,
      } satisfies WatchlistEntry;
    }),
  );

  return <WatchlistView entries={analysed} />;
}

function WatchlistSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-8 w-40 rounded-lg bg-paper-200" />
      <div className="mt-6 h-72 rounded-xl bg-paper-200" />
    </div>
  );
}