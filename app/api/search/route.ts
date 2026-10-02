import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { searchSymbols } from "@/lib/yahoo";
import { searchUniverse } from "@/lib/universe";

export const dynamic = "force-dynamic";

/**
 * GET /api/search?q=bca
 *
 * Answers from the curated universe first (instant, no upstream call), then
 * falls back to the free Yahoo search endpoint for anything outside it.
 */
export async function GET(request: Request) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  const query = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (query.length === 0) return NextResponse.json({ results: [] });

  const local = searchUniverse(query, 8).map((s) => ({
    symbol: s.symbol,
    name: s.name,
    exchange: "IDX",
    type: "EQUITY",
    sector: s.sector,
  }));

  // Enough local hits - skip the network round trip entirely.
  if (local.length >= 5) return NextResponse.json({ results: local });

  try {
    const remote = await searchSymbols(query);
    const seen = new Set(local.map((r) => r.symbol));
    const merged = [
      ...local,
      ...remote
        .filter((r) => !seen.has(r.symbol))
        .map((r) => ({
          symbol: r.symbol,
          name: r.name,
          exchange: r.exchange,
          type: r.type,
          sector: null as string | null,
        })),
    ];
    return NextResponse.json({ results: merged.slice(0, 10) });
  } catch {
    return NextResponse.json({ results: local });
  }
}
