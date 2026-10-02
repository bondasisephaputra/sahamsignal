import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { screenUniverse, toSignalRow } from "@/lib/analysis";

export const dynamic = "force-dynamic";

/**
 * GET /api/signals
 *
 * Query params:
 *   symbols    comma separated IDX codes
 *   sectors    comma separated sector names
 *   action     buy | hold | sell (repeatable via comma list)
 *   minConf    0-100
 *   limit      max rows
 */
export async function GET(request: Request) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = url.searchParams;

  const symbols = splitParam(q.get("symbols"));
  const sectors = splitParam(q.get("sectors"));
  const actions = splitParam(q.get("action")).filter((a): a is "buy" | "hold" | "sell" =>
    a === "buy" || a === "hold" || a === "sell",
  );

  const minConf = clampInt(q.get("minConf"), 0, 100, 0);
  const limit = clampInt(q.get("limit"), 1, 200, 60);

  try {
    const result = await screenUniverse({
      symbols: symbols.length ? symbols : undefined,
      sectors: sectors.length ? sectors : undefined,
      actions: actions.length ? actions : undefined,
      minConfidence: minConf || undefined,
      limit,
    });

    return NextResponse.json({
      generatedAt: result.generatedAt,
      market: result.market,
      scanned: result.total,
      analysed: result.analysed,
      failures: result.failures,
      // Same projection the server render uses, so the client can swap rows
      // wholesale on each poll.
      results: result.results.map(toSignalRow),
    });
  } catch (err) {
    console.error("[signals]", err);
    return NextResponse.json(
      { error: "Gagal memproses data pasar. Coba beberapa saat lagi." },
      { status: 502 },
    );
  }
}

function splitParam(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function clampInt(value: string | null, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}
