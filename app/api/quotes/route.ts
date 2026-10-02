import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { analyzeSymbol, isAnalysis } from "@/lib/analysis";
import { getMarketStatus } from "@/lib/market";

export const dynamic = "force-dynamic";

/**
 * GET /api/quotes?symbols=BBCA,BBRI,TLKM
 *
 * Lightweight payload for the live-polling ticker rows. Deliberately excludes
 * the heavy analysis fields that /api/signals returns.
 */
export async function GET(request: Request) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  const url = new URL(request.url);
  const symbols = (url.searchParams.get("symbols") ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z]{4}$/.test(s))
    .slice(0, 60);

  if (symbols.length === 0) {
    return NextResponse.json({ market: getMarketStatus(), quotes: [] });
  }

  try {
    const quotes = await Promise.all(
      symbols.map(async (symbol) => {
        const analysis = await analyzeSymbol(symbol);
        if (!isAnalysis(analysis)) return null;
        return {
          symbol: analysis.symbol,
          price: analysis.price,
          changePercent: analysis.changePercent,
          lastTradeAt: analysis.lastTradeAt,
          marketState: analysis.marketState,
          tier: analysis.signal.tier,
          score: analysis.signal.score,
          action: analysis.signal.action,
        };
      }),
    );

    return NextResponse.json({
      market: getMarketStatus(),
      quotes: quotes.filter((q) => q !== null),
    });
  } catch (err) {
    console.error("[quotes]", err);
    return NextResponse.json({ error: "Gagal mengambil kuotasi." }, { status: 502 });
  }
}
