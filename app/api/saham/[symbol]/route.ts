import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { analyzeSymbol, isAnalysis, recordSignals } from "@/lib/analysis";
import { getMarketStatus } from "@/lib/market";

export const dynamic = "force-dynamic";

/**
 * GET /api/saham/[symbol]
 *
 * Full single-stock analysis: quote, technical indicators, fundamental ratios,
 * the blended recommendation and the risk plan.
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/saham/[symbol]">,
) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  const { symbol: raw } = await ctx.params;
  const symbol = decodeURIComponent(raw).toUpperCase();

  if (!/^[A-Z]{4}$/.test(symbol)) {
    return NextResponse.json(
      { error: "Kode saham tidak valid. Gunakan 4 huruf, contoh BBCA." },
      { status: 400 },
    );
  }

  try {
    const analysis = await analyzeSymbol(symbol);

    if (!isAnalysis(analysis)) {
      return NextResponse.json({ error: analysis.reason }, { status: 404 });
    }

    // Best-effort history write; never fail the response because of it.
    recordSignals([analysis]).catch((err) =>
      console.warn("[saham] recordSignals failed:", err.message),
    );

    return NextResponse.json({
      market: getMarketStatus(),
      analysis,
    });
  } catch (err) {
    console.error(`[saham/${symbol}]`, err);
    return NextResponse.json(
      { error: "Gagal memuat analisis. Coba beberapa saat lagi." },
      { status: 502 },
    );
  }
}
