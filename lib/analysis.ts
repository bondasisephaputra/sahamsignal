import "server-only";

import { randomUUID } from "node:crypto";

import { analyzeFundamentals, type FundamentalAnalysis } from "./fundamental";
import { getDaily, getFundamentals, getIntraday, getIHSG, getUsdIdrRate } from "./yahoo";
import { analyzeTechnical, type TechnicalAnalysis } from "./technical";
import { computeSignal, type SignalResult, type SignalWeights } from "./signal";
import { displayName, getStockMeta, sectorOf, UNIVERSE } from "./universe";
import { getMarketStatus, type MarketStatus } from "./market";
import { batch } from "./db";

/**
 * Analysis orchestrator.
 *
 * Fans out to the Yahoo adapter (which is SQLite-cached), computes technical
 * and fundamental views, then blends them into a single recommendation.
 */

export interface StockAnalysis {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  previousClose: number | null;
  change: number;
  changePercent: number;
  open: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  averageVolume: number;
  relativeVolume: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  marketState: string;
  lastTradeAt: number | null;
  signal: SignalResult;
  technical: TechnicalAnalysis;
  fundamental: FundamentalAnalysis;
  /** Daily OHLC, newest last - the chart series. */
  candles: Array<{ t: number; o: number; h: number; l: number; c: number; v: number }>;
  /** Latest 5-minute intraday bars. */
  intraday: Array<{ t: number; o: number; h: number; l: number; c: number; v: number }>;
}

export interface AnalysisFailure {
  symbol: string;
  reason: string;
}

/**
 * One row of the screening table.
 *
 * Identical on the server render and over `/api/signals`, so a live poll
 * replaces rows in place instead of silently dropping every column. The heavy
 * `candles`/`intraday` series and the long-form verdicts are omitted because
 * a full-universe screen would otherwise serialise megabytes of OHLC.
 */
export type SignalRow = Omit<
  StockAnalysis,
  "candles" | "intraday" | "technical" | "fundamental"
> & {
  technical: Pick<TechnicalAnalysis, "trend" | "score" | "rsi14" | "confidence" | "adx">;
  fundamental: {
    available: boolean;
    score: number;
    coverage: number;
    pe: number | null;
    roe: number | null;
  };
};

/** Project a full analysis down to a table row. */
export function toSignalRow(a: StockAnalysis): SignalRow {
  return {
    symbol: a.symbol,
    name: a.name,
    sector: a.sector,
    price: a.price,
    previousClose: a.previousClose,
    change: a.change,
    changePercent: a.changePercent,
    open: a.open,
    dayHigh: a.dayHigh,
    dayLow: a.dayLow,
    volume: a.volume,
    averageVolume: a.averageVolume,
    relativeVolume: a.relativeVolume,
    fiftyTwoWeekHigh: a.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: a.fiftyTwoWeekLow,
    marketState: a.marketState,
    lastTradeAt: a.lastTradeAt,
    signal: a.signal,
    technical: {
      trend: a.technical.trend,
      score: a.technical.score,
      rsi14: a.technical.rsi14,
      confidence: a.technical.confidence,
      adx: a.technical.adx,
    },
    fundamental: {
      available: a.fundamental.available,
      score: a.fundamental.score,
      coverage: a.fundamental.coverage,
      pe: a.fundamental.valuation.pe,
      roe: a.fundamental.profitability.roe,
    },
  };
}

/** Maximum simultaneous upstream requests. Keeps us polite and avoids bursts. */
const CONCURRENCY = 6;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Analyse one symbol end to end.
 *
 * Daily bars drive the indicators; the live intraday quote supplies the
 * current price so signals reflect the session in progress, not yesterday's
 * close. Fundamentals are optional - a missing report downgrades the signal
 * to technical-only instead of failing the whole request.
 */
export async function analyzeSymbol(
  symbol: string,
  weights?: SignalWeights,
): Promise<StockAnalysis | AnalysisFailure> {
  const [daily, intraday, fundamentals, usdIdr] = await Promise.all([
    getDaily(symbol).catch(() => null),
    getIntraday(symbol).catch(() => null),
    getFundamentals(symbol).catch(() => null),
    getUsdIdrRate().catch(() => null),
  ]);

  if (!daily || daily.candles.length < 30) {
    return { symbol, reason: "Data historis tidak mencukupi (minimal 30 hari bursa)." };
  }

  const livePrice = intraday?.price ?? daily.price;
  if (!livePrice || !Number.isFinite(livePrice)) {
    return { symbol, reason: "Harga terkini tidak tersedia." };
  }

  const technical = analyzeTechnical(daily.candles, livePrice);
  const fundamental = analyzeFundamentals(fundamentals, livePrice, usdIdr);
  const signal = computeSignal({
    symbol,
    price: livePrice,
    changePercent: daily.changePercent,
    technical,
    fundamental,
    weights,
  });

  const meta = getStockMeta(symbol);

  return {
    symbol,
    name: meta?.name ?? displayName(symbol),
    sector: meta?.sector ?? sectorOf(symbol),
    price: livePrice,
    previousClose: intraday?.previousClose ?? daily.previousClose,
    change: (livePrice - (intraday?.previousClose ?? daily.previousClose ?? livePrice)),
    changePercent: intraday?.changePercent ?? daily.changePercent,
    open: intraday?.open ?? daily.open,
    dayHigh: intraday?.dayHigh ?? daily.dayHigh,
    dayLow: intraday?.dayLow ?? daily.dayLow,
    volume: intraday?.volume ?? daily.volume,
    averageVolume: daily.averageVolume,
    relativeVolume: technical.relativeVolume,
    fiftyTwoWeekHigh: daily.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: daily.fiftyTwoWeekLow,
    marketState: intraday?.marketState ?? daily.marketState,
    lastTradeAt: intraday?.lastTradeAt ?? daily.lastTradeAt,
    signal,
    technical,
    fundamental,
    candles: daily.candles,
    intraday: intraday?.candles ?? [],
  };
}

export function isAnalysis(
  value: StockAnalysis | AnalysisFailure,
): value is StockAnalysis {
  return "signal" in value;
}

export interface ScreenResult {
  generatedAt: number;
  market: MarketStatus;
  total: number;
  analysed: number;
  results: StockAnalysis[];
  failures: AnalysisFailure[];
}

/**
 * Screen the whole universe (or a filtered subset).
 *
 * Fundamentals are only fetched for names that already look technically
 * interesting, which cuts upstream calls dramatically on a cold cache.
 */
export async function screenUniverse(options?: {
  symbols?: string[];
  sectors?: string[];
  actions?: Array<"buy" | "hold" | "sell">;
  minConfidence?: number;
  limit?: number;
  weights?: SignalWeights;
}): Promise<ScreenResult> {
  const wanted = new Set((options?.symbols ?? []).map((s) => s.toUpperCase()));
  const sectorFilter = new Set(options?.sectors ?? []);

  let universe = UNIVERSE;
  if (wanted.size > 0) universe = universe.filter((s) => wanted.has(s.symbol));
  if (sectorFilter.size > 0) universe = universe.filter((s) => sectorFilter.has(s.sector));

  const outcomes = await mapWithConcurrency(universe, CONCURRENCY, (stock) =>
    analyzeSymbol(stock.symbol, options?.weights),
  );

  const results: StockAnalysis[] = [];
  const failures: AnalysisFailure[] = [];
  for (const o of outcomes) {
    if (isAnalysis(o)) results.push(o);
    else failures.push(o);
  }

  let filtered = results;
  if (options?.actions && options.actions.length > 0) {
    const actions = new Set(options.actions);
    filtered = filtered.filter((r) => actions.has(r.signal.action));
  }
  if (typeof options?.minConfidence === "number") {
    filtered = filtered.filter((r) => r.signal.confidence >= options.minConfidence!);
  }

  // Strongest conviction first.
  filtered.sort(
    (a, b) =>
      Math.abs(b.signal.score) - Math.abs(a.signal.score) ||
      b.signal.confidence - a.signal.confidence,
  );

  return {
    generatedAt: Date.now(),
    market: getMarketStatus(),
    total: universe.length,
    analysed: results.length,
    results: options?.limit ? filtered.slice(0, options.limit) : filtered,
    failures,
  };
}

/** IHSG index snapshot for the market banner. */
export async function getMarketOverview() {
  const status = getMarketStatus();
  const ihsg = await getIHSG().catch(() => null);

  if (!ihsg) {
    return { status, ihsg: null, breadth: null };
  }

  // Use the index's own trading day to derive simple market breadth.
  const closes = ihsg.candles.map((c) => c.c);
  const breadth = closes.length >= 2 ? closes[closes.length - 1] - closes[closes.length - 2] : 0;

  return { status, ihsg, breadth };
}

/** Persist today's signal so accuracy can be reviewed later. */
export async function recordSignals(results: StockAnalysis[]): Promise<void> {
  if (results.length === 0) return;

  const { asOfDate } = dateKeys();
  const statements = results.map((r) => ({
    sql: `INSERT INTO signal_history
            (id, symbol, as_of_date, signal, score, tech_score, fund_score, price, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(symbol, as_of_date) DO UPDATE SET
            signal = excluded.signal,
            score = excluded.score,
            tech_score = excluded.tech_score,
            fund_score = excluded.fund_score,
            price = excluded.price,
            created_at = excluded.created_at`,
    args: [
      randomUUID(),
      r.symbol,
      asOfDate,
      r.signal.tier,
      r.signal.score,
      r.signal.techScore,
      r.signal.fundScore,
      r.signal.price,
      Date.now(),
    ],
  }));

  await batch(statements);
}

function dateKeys(): { asOfDate: string; tradeDate: string } {
  const s = getMarketStatus();
  return { asOfDate: s.wibDate, tradeDate: s.wibDate };
}
