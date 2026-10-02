import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { getSessionUser } from "@/lib/auth";
import { analyzeSymbol, isAnalysis, recordSignals } from "@/lib/analysis";
import { displayName, sectorOf } from "@/lib/universe";
import { listWatchlist } from "@/lib/watchlist";
import { StockDetail } from "@/components/StockDetail";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata(
  props: PageProps<"/dashboard/saham/[symbol]">,
): Promise<Metadata> {
  const { symbol } = await props.params;
  const code = symbol.toUpperCase();
  return {
    title: `${code} · ${displayName(code)}`,
    description: `Analisis fundamental dan teknikal ${code} (${displayName(code)}) lengkap dengan rekomendasi beli atau jual dan level stop loss.`,
  };
}

export default async function StockPage(props: PageProps<"/dashboard/saham/[symbol]">) {
  const user = await getSessionUser();
  if (!user) notFound();

  const { symbol: raw } = await props.params;
  const symbol = decodeURIComponent(raw).toUpperCase();

  if (!/^[A-Z]{4}$/.test(symbol)) notFound();

  const watchlist = await listWatchlist(user.id);

  return (
    <Suspense fallback={<DetailSkeleton />}>
      <Loader
        symbol={symbol}
        isWatched={watchlist.some((w) => w.symbol === symbol)}
      />
    </Suspense>
  );
}

async function Loader({ symbol, isWatched }: { symbol: string; isWatched: boolean }) {
  const result = await analyzeSymbol(symbol);

  if (!isAnalysis(result)) {
    return (
      <div className="card px-6 py-12 text-center">
        <p className="font-display text-base font-semibold text-paper-900">
          Analisis tidak tersedia
        </p>
        <p className="mx-auto mt-2 max-w-md text-sm text-paper-500">{result.reason}</p>
        <Link href="/dashboard/sinyal" className="btn-secondary mt-5">
          Kembali ke daftar sinyal
        </Link>
      </div>
    );
  }

  // Keep a daily record of every published signal for later accuracy review.
  recordSignals([result]).catch(() => {});

  return (
    <StockDetail analysis={result} isWatched={isWatched} sector={sectorOf(symbol)} />
  );
}

function DetailSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-6 w-24 rounded bg-paper-200" />
      <div className="mt-3 h-10 w-72 rounded-lg bg-paper-200" />
      <div className="mt-6 h-80 rounded-xl bg-paper-200" />
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="h-64 rounded-xl bg-paper-200" />
        <div className="h-64 rounded-xl bg-paper-200" />
        <div className="h-64 rounded-xl bg-paper-200" />
      </div>
    </div>
  );
}