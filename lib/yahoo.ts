import "server-only";

import { selectOne } from "./db";
import { cacheTtlSeconds } from "./market";

/**
 * Free, keyless market-data source.
 *
 * Yahoo Finance's public chart + fundamentals-timeseries endpoints are used
 * directly - no API key, no signup, no quota. To stay a good citizen (and to
 * keep the UI fast) every response is persisted in the local `data_cache`
 * table with a TTL that depends on whether the market is currently open.
 *
 * Symbols use the Yahoo convention for the IDX: `BBCA` -> `BBCA.JK`.
 */

const CHART_HOSTS = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

export const IDX_SUFFIX = ".JK";
export const IHSG_SYMBOL = "^JKSE";

/* -------------------------------------------------------------------------- */
/*                                  Symbols                                   */
/* -------------------------------------------------------------------------- */

/** Normalise user input ("bbca", "BBCA.JK", "  BBCA ") to a bare IDX code. */
export function normalizeSymbol(input: string): string | null {
  const raw = String(input ?? "").trim().toUpperCase();
  if (!raw) return null;
  const bare = raw.endsWith(IDX_SUFFIX) ? raw.slice(0, -IDX_SUFFIX.length) : raw;
  // IDX tickers are 4 characters, uppercase A-Z.
  return /^[A-Z]{4}$/.test(bare) ? bare : null;
}

/** Full Yahoo symbol for an IDX code. */
export function toYahooSymbol(symbol: string): string {
  const bare = normalizeSymbol(symbol) ?? symbol;
  return bare.startsWith("^") ? bare : `${bare}${IDX_SUFFIX}`;
}

/* -------------------------------------------------------------------------- */
/*                                   Cache                                    */
/* -------------------------------------------------------------------------- */

async function readCache<T>(key: string): Promise<T | null> {
  const row = await selectOne<{ payload: string; expires_at: number }>(
    "SELECT payload, expires_at FROM data_cache WHERE cache_key = ? LIMIT 1",
    [key],
  );
  if (!row) return null;
  if (row.expires_at < Date.now()) return null;

  try {
    return JSON.parse(row.payload) as T;
  } catch {
    return null;
  }
}

async function writeCache(key: string, payload: unknown, ttlSeconds: number): Promise<void> {
  const now = Date.now();
  try {
    const { execute } = await import("./db");
    await execute(
      `INSERT INTO data_cache (cache_key, payload, fetched_at, expires_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET
         payload = excluded.payload,
         fetched_at = excluded.fetched_at,
         expires_at = excluded.expires_at`,
      [key, JSON.stringify(payload), now, now + ttlSeconds * 1000],
    );
  } catch (err) {
    // A cache write failure must never break a request.
    console.warn("[yahoo] cache write failed:", (err as Error).message);
  }
}

/** Drop expired cache rows. */
export async function pruneCache(): Promise<void> {
  const { execute } = await import("./db");
  await execute("DELETE FROM data_cache WHERE expires_at < ?", [Date.now() - 86400_000]);
}

/* -------------------------------------------------------------------------- */
/*                                   Fetch                                    */
/* -------------------------------------------------------------------------- */

async function yahooFetch(path: string, attempt = 0): Promise<unknown> {
  const host = CHART_HOSTS[attempt % CHART_HOSTS.length];
  const url = `${host}${path}`;

  const res = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
      return yahooFetch(path, attempt + 1);
    }
    throw new Error(`Yahoo HTTP ${res.status} for ${path}`);
  }
  return res.json();
}

/* -------------------------------------------------------------------------- */
/*                                   Charts                                   */
/* -------------------------------------------------------------------------- */

export interface Candle {
  t: number; // unix seconds
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface ChartSeries {
  symbol: string;
  name: string | null;
  price: number;
  previousClose: number | null;
  change: number;
  changePercent: number;
  dayHigh: number;
  dayLow: number;
  open: number;
  volume: number;
  averageVolume: number;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  marketState: string;
  currency: string;
  lastTradeAt: number | null;
  candles: Candle[];
}

interface RawMeta {
  symbol?: string;
  shortName?: string;
  longName?: string;
  currency?: string;
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  previousClose?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketOpen?: number;
  regularMarketVolume?: number;
  regularMarketTime?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  marketState?: string;
}

/**
 * @param seriesKind - `daily` means the candles span many sessions, so the
 *   previous close must be derived from the series. `intraday` means the
 *   candles are all from the current session, where `meta.chartPreviousClose`
 *   is already yesterday's close.
 */
function parseChart(
  raw: unknown,
  wantCandles: boolean,
  seriesKind: "daily" | "intraday",
): ChartSeries | null {
  const root = raw as {
    chart?: { result?: Array<{ meta?: RawMeta; timestamp?: number[]; indicators?: unknown }>; error?: unknown };
  } | null;
  const result = root?.chart?.result?.[0];
  if (!result?.meta) return null;

  const meta = result.meta;
  const ts = result.timestamp ?? [];
  const quote = (
    result.indicators as { quote?: Array<Record<string, Array<number | null> | undefined>> } | undefined
  )?.quote?.[0];
  const adj = (
    result.indicators as { adjclose?: Array<{ adjclose?: Array<number | null> }> } | undefined
  )?.adjclose?.[0]?.adjclose;

  const opens = quote?.open ?? [];
  const highs = quote?.high ?? [];
  const lows = quote?.low ?? [];
  const closes = quote?.close ?? adj ?? [];
  const volumes = quote?.volume ?? [];

  const candles: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (c === null || c === undefined || Number.isNaN(c)) continue;
    candles.push({
      t: ts[i],
      o: opens[i] ?? c,
      h: highs[i] ?? c,
      l: lows[i] ?? c,
      c,
      v: volumes[i] ?? 0,
    });
  }

  const last = candles.length > 0 ? candles[candles.length - 1] : null;
  const price = meta.regularMarketPrice ?? last?.c ?? 0;

  // `chartPreviousClose` means different things depending on the requested
  // range: for `range=1d` it is yesterday's close, but for `range=1y` it is
  // the close at the *start* of the window. Using the latter for a daily series
  // produces a change figure spanning a year, so multi-session series derive
  // the previous close from the second-to-last candle instead.
  const prevCandle = candles.length >= 2 ? candles[candles.length - 2] : null;
  const previousClose =
    seriesKind === "daily" && prevCandle
      ? prevCandle.c
      : (meta.chartPreviousClose ?? meta.previousClose ?? null);
  const change = previousClose !== null ? price - previousClose : 0;

  // 20-day average volume gives the "is volume unusual?" input.
  const recent = candles.slice(-21, -1).map((c) => c.v).filter((v) => v > 0);
  const averageVolume = recent.length
    ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length)
    : 0;

  return {
    symbol: (meta.symbol ?? "").replace(IDX_SUFFIX, ""),
    name: meta.longName ?? meta.shortName ?? null,
    price,
    previousClose,
    change,
    changePercent: previousClose ? (change / previousClose) * 100 : 0,
    dayHigh: meta.regularMarketDayHigh ?? last?.h ?? price,
    dayLow: meta.regularMarketDayLow ?? last?.l ?? price,
    open: meta.regularMarketOpen ?? last?.o ?? price,
    volume: meta.regularMarketVolume ?? last?.v ?? 0,
    averageVolume,
    fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null,
    fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
    marketState: meta.marketState ?? "UNKNOWN",
    currency: meta.currency ?? "IDR",
    lastTradeAt: meta.regularMarketTime ?? last?.t ?? null,
    candles: wantCandles ? candles : [],
  };
}

/** Live quote + today's intraday candles (5-minute bars). */
export async function getIntraday(symbol: string): Promise<ChartSeries | null> {
  const bare = normalizeSymbol(symbol);
  if (!bare) return null;

  const key = `chart:intraday:${bare}`;
  const cached = await readCache<ChartSeries>(key);
  if (cached) return cached;

  const raw = await yahooFetch(
    `/v8/finance/chart/${toYahooSymbol(bare)}?interval=5m&range=1d&includePrePost=false`,
  );
  const parsed = parseChart(raw, true, "intraday");
  if (parsed) await writeCache(key, parsed, cacheTtlSeconds("intraday"));
  return parsed;
}

/**
 * Current USD/IDR rate.
 *
 * Several IDX issuers file their financial statements in USD while their shares
 * trade in IDX on rupiah. Yahoo does not label the reporting currency, so the
 * only reliable way to make those ratios meaningful is to convert with a real
 * exchange rate rather than guess a scale factor.
 *
 * Cached for a day: a spot rate is not needed at tick resolution, and this
 * keeps one shared request for the whole universe rather than one per symbol.
 */
export async function getUsdIdrRate(): Promise<number | null> {
  const key = "fx:usdidr";
  const cached = await readCache<number>(key);
  if (cached) return cached;

  let rate: number | null = null;
  try {
    const raw = await yahooFetch(
      `/v8/finance/chart/USDIDR=X?interval=1d&range=5d`,
    );
    const parsed = parseChart(raw, false, "intraday");
    if (parsed && Number.isFinite(parsed.price) && parsed.price > 1000) {
      rate = parsed.price;
    }
  } catch {
    return null;
  }

  // A day is plenty; the rate only has to be right to about 1%.
  if (rate) await writeCache(key, rate, 24 * 3600);
  return rate;
}

/** ~1 year of daily candles - the input for every technical indicator. */
export async function getDaily(symbol: string): Promise<ChartSeries | null> {
  const bare = normalizeSymbol(symbol);
  if (!bare) return null;

  const key = `chart:daily:${bare}`;
  const cached = await readCache<ChartSeries>(key);
  if (cached) return cached;

  const raw = await yahooFetch(
    `/v8/finance/chart/${toYahooSymbol(bare)}?interval=1d&range=1y`,
  );
  const parsed = parseChart(raw, true, "daily");
  if (parsed) await writeCache(key, parsed, cacheTtlSeconds("daily"));
  return parsed;
}

/** IHSG benchmark index. */
export async function getIHSG(): Promise<ChartSeries | null> {
  const key = `chart:daily:${IHSG_SYMBOL}`;
  const cached = await readCache<ChartSeries>(key);
  if (cached) return cached;

  const raw = await yahooFetch(
    `/v8/finance/chart/${encodeURIComponent(IHSG_SYMBOL)}?interval=1d&range=1y`,
  );
  const parsed = parseChart(raw, true, "daily");
  if (parsed) await writeCache(key, parsed, cacheTtlSeconds("daily"));
  return parsed;
}

/* -------------------------------------------------------------------------- */
/*                                Fundamentals                                */
/* -------------------------------------------------------------------------- */

/**
 * Yahoo's `quarterly*` series is frequently incomplete - many IDX names return
 * only three or four quarters, and some skip a quarter entirely. Summing
 * whatever is present then produces a "TTM" figure that is really nine months,
 * which quietly distorts every ratio.
 *
 * The `trailing*` series is Yahoo's own trailing-twelve-month aggregate and is
 * present and consistent for income-statement items, so it is the primary
 * source. `quarterly*` is kept for point-in-time balance-sheet items (assets,
 * equity, debt) which have no trailing form, and for the older quarters needed
 * to show a trend. `annual*` provides the prior full year for growth.
 */
const FUND_TYPES = [
  // Trailing (TTM) aggregates - authoritative for income statement items.
  "trailingTotalRevenue",
  "trailingNetIncome",
  "trailingGrossProfit",
  "trailingOperatingIncome",
  "trailingFreeCashFlow",
  "trailingDilutedEPS",
  "trailingMarketCap",
  "trailingBasicAverageShares",
  // Annual aggregates - prior full year, used for the YoY comparison.
  "annualTotalRevenue",
  "annualNetIncome",
  "annualDilutedEPS",
  // Quarterly - balance sheet snapshots and the per-quarter trend.
  "quarterlyTotalAssets",
  "quarterlyStockholdersEquity",
  "quarterlyTotalDebt",
  "quarterlyCurrentAssets",
  "quarterlyCurrentLiabilities",
  "quarterlyTotalRevenue",
  "quarterlyNetIncome",
  "quarterlyDilutedEPS",
] as const;

export interface FundamentalQuarter {
  asOfDate: string;
  revenue: number | null;
  netIncome: number | null;
  grossProfit: number | null;
  operatingIncome: number | null;
  totalAssets: number | null;
  equity: number | null;
  totalDebt: number | null;
  currentAssets: number | null;
  currentLiabilities: number | null;
  freeCashFlow: number | null;
  eps: number | null;
  marketCap: number | null;
}

/** Prior full fiscal year, for the year-on-year growth comparison. */
export interface AnnualFigure {
  asOfDate: string;
  revenue: number | null;
  netIncome: number | null;
  eps: number | null;
}

export interface Fundamentals {
  symbol: string;
  currency: string;
  quarters: FundamentalQuarter[];
  /** Most recent quarter with a usable figure, by field availability. */
  latest: FundamentalQuarter | null;
  /**
   * Trailing twelve months. Income-statement items come straight from Yahoo's
   * `trailing*` series; balance-sheet items are point-in-time snapshots taken
   * from the latest quarter.
   */
  ttm: FundamentalQuarter | null;
  /** Fiscal years, newest last. */
  annual: AnnualFigure[];
  /** Most recent completed fiscal year, or null if only the current one is reported. */
  priorAnnual: AnnualFigure | null;
  /**
   * Weighted average shares outstanding, trailing twelve months. Lets the
   * caller rebuild a live market cap and cross-check the unit of the reported
   * figures, since Yahoo does not label the reporting currency.
   */
  shares: number | null;
  hasData: boolean;
}

interface TsPoint {
  asOfDate?: string;
  reportedValue?: { raw?: number };
}

/** Merge Yahoo's column-per-metric timeseries into row-per-quarter records. */
export async function getFundamentals(symbol: string): Promise<Fundamentals> {
  const bare = normalizeSymbol(symbol);
  const empty: Fundamentals = {
    symbol: bare ?? symbol,
    currency: "IDR",
    quarters: [],
    latest: null,
    ttm: null,
    annual: [],
    priorAnnual: null,
    shares: null,
    hasData: false,
  };
  if (!bare) return empty;

  const key = `fund:${bare}`;
  const cached = await readCache<Fundamentals>(key);
  if (cached) return cached;

  const now = Math.floor(Date.now() / 1000);
  const path =
    `/ws/fundamentals-timeseries/v1/finance/timeseries/${toYahooSymbol(bare)}` +
    `?symbol=${toYahooSymbol(bare)}` +
    `&type=${FUND_TYPES.join(",")}` +
    `&period1=${now - 5 * 365 * 86400}&period2=${now}`;

  let raw: unknown = null;
  try {
    raw = await yahooFetch(path);
  } catch (err) {
    console.warn(`[yahoo] fundamentals failed for ${bare}:`, (err as Error).message);
    return empty;
  }

  const result = (raw as { timeseries?: { result?: Array<Record<string, unknown>> } })
    ?.timeseries?.result;
  if (!Array.isArray(result)) return empty;

  // Each series is collected independently. Merging them into one record per
  // date would conflate a trailing aggregate with a single quarter, so the
  // three families stay separate.
  const trailing = new Map<string, number>();
  const annual = new Map<string, { revenue: number | null; netIncome: number | null; eps: number | null }>();
  const quarterly = new Map<string, Record<string, number>>();

  const asNumber = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

  for (const entry of result) {
    const type = (entry?.meta as { type?: string[] } | undefined)?.type?.[0] as
      | (typeof FUND_TYPES)[number]
      | undefined;
    if (!type) continue;

    const points = entry[type] as TsPoint[] | undefined;
    if (!Array.isArray(points)) continue;

    for (const p of points) {
      if (!p?.asOfDate) continue;
      const value = asNumber(p.reportedValue?.raw);
      if (value === null) continue;

      if (type.startsWith("trailing")) {
        // Keep the most recent trailing observation of each metric.
        trailing.set(type.slice("trailing".length), value);
      } else if (type.startsWith("annual")) {
        const row = annual.get(p.asOfDate) ?? { revenue: null, netIncome: null, eps: null };
        const field: keyof typeof row | undefined =
          type === "annualTotalRevenue"
            ? "revenue"
            : type === "annualNetIncome"
              ? "netIncome"
              : type === "annualDilutedEPS"
                ? "eps"
                : undefined;
        if (field) row[field] = value;
        annual.set(p.asOfDate, row);
      } else {
        const row = quarterly.get(p.asOfDate) ?? {};
        row[type] = value;
        quarterly.set(p.asOfDate, row);
      }
    }
  }

  const pick = (row: Record<string, number>, key2: string): number | null =>
    asNumber(row[key2]);

  const quarters: FundamentalQuarter[] = [...quarterly.entries()]
    .map(([date, row]) => ({
      asOfDate: date,
      revenue: pick(row, "quarterlyTotalRevenue"),
      netIncome: pick(row, "quarterlyNetIncome"),
      grossProfit: null,
      operatingIncome: null,
      totalAssets: pick(row, "quarterlyTotalAssets"),
      equity: pick(row, "quarterlyStockholdersEquity"),
      totalDebt: pick(row, "quarterlyTotalDebt"),
      currentAssets: pick(row, "quarterlyCurrentAssets"),
      currentLiabilities: pick(row, "quarterlyCurrentLiabilities"),
      freeCashFlow: null,
      eps: pick(row, "quarterlyDilutedEPS"),
      marketCap: null,
    }))
    .sort((a, b) => a.asOfDate.localeCompare(b.asOfDate));

  const annualList: AnnualFigure[] = [...annual.entries()]
    .map(([date, row]) => ({ asOfDate: date, ...row }))
    .sort((a, b) => a.asOfDate.localeCompare(b.asOfDate));

  // "Latest" = most recent quarter with a balance sheet or income statement.
  const latest = [...quarters].reverse().find((q) => q.equity !== null || q.totalAssets !== null) ?? null;

  const trailingValue = (field: string): number | null => asNumber(trailing.get(field));

  const sum4 = (field: keyof FundamentalQuarter): number | null => {
    const vals = quarters
      .slice(-4)
      .map((r) => r[field])
      .filter((v): v is number => typeof v === "number");
    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0);
  };
  const last1 = (field: keyof FundamentalQuarter): number | null => {
    const v = latest?.[field];
    return typeof v === "number" ? v : null;
  };

  const ttm: FundamentalQuarter | null =
    latest || trailing.size > 0
      ? {
          // Yahoo's trailing aggregates win; the quarterly sum is only a
          // fallback for names where the trailing series is missing.
          asOfDate: latest?.asOfDate ?? "",
          revenue: trailingValue("TotalRevenue") ?? sum4("revenue"),
          netIncome: trailingValue("NetIncome") ?? sum4("netIncome"),
          grossProfit: trailingValue("GrossProfit") ?? sum4("grossProfit"),
          operatingIncome: trailingValue("OperatingIncome") ?? sum4("operatingIncome"),
          // Balance-sheet items are point-in-time: use the latest, not a sum.
          totalAssets: last1("totalAssets"),
          equity: last1("equity"),
          totalDebt: last1("totalDebt"),
          currentAssets: last1("currentAssets"),
          currentLiabilities: last1("currentLiabilities"),
          freeCashFlow: trailingValue("FreeCashFlow") ?? sum4("freeCashFlow"),
          eps: trailingValue("DilutedEPS") ?? sum4("eps"),
          marketCap: trailingValue("MarketCap") ?? last1("marketCap"),
        }
      : null;

  // The most recent completed fiscal year that is not the one the TTM window
  // mostly covers. With only one year reported there is nothing to compare to.
  const priorAnnual = annualList.length >= 2 ? annualList[annualList.length - 2] : null;

  const payload: Fundamentals = {
    symbol: bare,
    currency: "IDR",
    quarters,
    latest,
    ttm,
    annual: annualList,
    priorAnnual,
    shares: trailingValue("BasicAverageShares"),
    hasData: quarters.length > 0 || annualList.length > 0,
  };

  await writeCache(key, payload, cacheTtlSeconds("fundamentals"));
  return payload;
}

/* -------------------------------------------------------------------------- */
/*                                  Search                                    */
/* -------------------------------------------------------------------------- */

export interface SymbolMatch {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

export async function searchSymbols(query: string): Promise<SymbolMatch[]> {
  const q = query.trim();
  if (q.length < 1) return [];

  const raw = await yahooFetch(
    `/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=20&newsCount=0&listsCount=0`,
  ).catch(() => null);

  const quotes = (raw as { quotes?: Array<Record<string, string>> } | null)?.quotes ?? [];

  const results: SymbolMatch[] = [];
  const seen = new Set<string>();

  for (const item of quotes) {
    const symbol = item.symbol ?? "";
    if (!symbol.endsWith(IDX_SUFFIX)) continue;
    if (item.quoteType && item.quoteType !== "EQUITY") continue;

    const bare = symbol.slice(0, -IDX_SUFFIX.length);
    if (seen.has(bare)) continue;
    seen.add(bare);

    results.push({
      symbol: bare,
      name: item.longname || item.shortname || bare,
      exchange: item.exchDisp ?? "IDX",
      type: item.quoteType ?? "EQUITY",
    });
    if (results.length >= 8) break;
  }

  return results;
}
