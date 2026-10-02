import type { Fundamentals } from "./yahoo";
import { clamp } from "./technical";

/**
 * Fundamental analysis.
 *
 * Inputs come from Yahoo's `fundamentals-timeseries` endpoint, which reports
 * raw quarterly figures in IDR. Ratios are derived here so the UI never has
 * to do arithmetic, and every verdict carries a human-readable justification.
 */

export interface FundamentalMetric {
  key: string;
  label: string;
  value: number | null;
  formatted: string;
  /** Neutral range for an Indonesian large/mid cap, shown as guidance. */
  band: string;
}

export interface FundamentalVerdict {
  key: string;
  label: string;
  score: number;
  detail: string;
  bias: "bullish" | "bearish" | "neutral";
}

export interface FundamentalAnalysis {
  available: boolean;
  /** Most recent reporting period, e.g. "2026-06". */
  period: string | null;
  metrics: FundamentalMetric[];
  verdicts: FundamentalVerdict[];
  score: number;
  /** 0..100 - driven by how many ratios could actually be computed. */
  coverage: number;
  growth: {
    revenueYoY: number | null;
    netIncomeYoY: number | null;
    revenueQoQ: number | null;
  };
  profitability: {
    grossMargin: number | null;
    operatingMargin: number | null;
    netMargin: number | null;
    roe: number | null;
    roa: number | null;
  };
  valuation: {
    pe: number | null;
    pb: number | null;
    ps: number | null;
    evEbitda: number | null;
  };
  health: {
    debtToEquity: number | null;
    currentRatio: number | null;
    netDebtToEbit: number | null;
  };
}

/** Format a ratio as a percentage with 1 decimal. */
function pct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "-";
  return `${v.toFixed(digits)}%`;
}

function ratio(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "-";
  return v.toFixed(digits);
}

function rupiah(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "-";
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${(v / 1e12).toFixed(2)} T`;
  if (abs >= 1e9) return `${(v / 1e9).toFixed(2)} M`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(2)} jt`;
  return v.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

/**
 * Scale a value onto -100..100 given "good" and "bad" anchors.
 * Values above `good` score +100; below `bad`, -100; linear in between.
 */
function ramp(value: number | null, good: number, bad: number): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  if (good === bad) return 0;
  const t = (value - bad) / (good - bad); // 0 at bad, 1 at good
  return clamp((t - 0.5) * 200, -100, 100);
}



/**
 * PER above this is not a valuation, it is a units error.
 *
 * The most expensive listed company in history trades at a few hundred times
 * earnings. Anything beyond this bound means the numerator and the denominator
 * are in different currencies.
 */
const MAX_PLAUSIBLE_PER = 500;

/**
 * Decide whether a report is denominated in IDR, and return the multiplier that
 * converts its figures into rupiah.
 *
 * Yahoo does not label the reporting currency, and several IDX issuers (the
 * coal and gold names especially) file in USD. Dividing an IDR market cap by USD
 * earnings yields a PER in the hundreds of thousands - a units bug, not a
 * signal.
 *
 * The test is deliberately conservative: a raw PER has to be beyond any
 * plausible valuation *and* dividing by the live USD/IDR rate has to bring it
 * back into a believable range. A genuine IDR reporter can never satisfy both,
 * so a genuine IDR report is never altered. When the evidence is ambiguous the
 * figures are left alone and the resulting ratio is discarded downstream.
 *
 * @returns the multiplier to apply to reported figures, or `1` when the report
 *   is already in IDR.
 */
function detectCurrencyScale(
  ttm: NonNullable<Fundamentals["ttm"]>,
  price: number,
  shares: number,
  usdIdr: number | null,
): number {
  if (!usdIdr || usdIdr <= 1000) return 1;
  if (ttm.netIncome === null || ttm.netIncome <= 0) return 1;

  const marketCap = price * shares;
  const rawPer = marketCap / ttm.netIncome;
  if (rawPer <= MAX_PLAUSIBLE_PER) return 1;

  // Only convert if the corrected PER lands somewhere a real company could sit.
  const corrected = rawPer / usdIdr;
  if (corrected < 0.5 || corrected > MAX_PLAUSIBLE_PER) return 1;

  return usdIdr;
}

/**
 * @param price live price in IDR. When provided, market cap and PER are
 *   recomputed from the current price and the reported share count instead of
 *   using Yahoo's stale trailing market cap, and any unit mismatch between the
 *   reported financials and IDR is corrected.
 */
export function analyzeFundamentals(
  fund: Fundamentals | null,
  price?: number | null,
  usdIdr?: number | null,
): FundamentalAnalysis {
  const blank: FundamentalAnalysis = {
    available: false,
    period: null,
    metrics: [],
    verdicts: [],
    score: 0,
    coverage: 0,
    growth: { revenueYoY: null, netIncomeYoY: null, revenueQoQ: null },
    profitability: {
      grossMargin: null,
      operatingMargin: null,
      netMargin: null,
      roe: null,
      roa: null,
    },
    valuation: { pe: null, pb: null, ps: null, evEbitda: null },
    health: { debtToEquity: null, currentRatio: null, netDebtToEbit: null },
  };

  if (!fund?.hasData) return blank;

  const ttm = fund.ttm;
  const latest = fund.latest;
  if (!ttm || !latest) return blank;

  /*
   * Normalise the report into rupiah once, up front.
   *
   * Yahoo quotes market cap in IDR but does not label the reporting currency of
   * the income statement, and a handful of IDX issuers file in USD. When that
   * happens every figure here is off by the exchange rate, so the correction has
   * to be applied to the raw values before any ratio is derived - not patched
   * into the ratios afterwards. Ratios *within* the report (margins, ROE, DER)
   * are unaffected either way, but the absolute rupiah amounts shown to the
   * user and every market-cap-relative multiple depend on it.
   */
  const shares = fund.shares;
  const scale =
    price && shares && shares > 0 ? detectCurrencyScale(ttm, price, shares, usdIdr ?? null) : 1;
  const toIdr = (v: number | null): number | null => (v === null ? null : v * scale);

  const rev = toIdr(ttm.revenue);
  const ni = toIdr(ttm.netIncome);
  const equity = toIdr(ttm.equity);
  const totalAssets = toIdr(ttm.totalAssets);
  const totalDebt = toIdr(ttm.totalDebt);
  const ebit = toIdr(ttm.operatingIncome);
  const grossProfit = toIdr(ttm.grossProfit);
  const freeCashFlow = toIdr(ttm.freeCashFlow);

  // Prefer a market cap rebuilt from the live price and the reported share
  // count: Yahoo's trailing figure lags by up to a quarter, and a PER derived
  // from a stale cap is a stale PER.
  const marketCap = price && shares ? price * shares : ttm.marketCap;

  /* ------------------------------- Growth ------------------------------- */
  const quarters = fund.quarters;
  const yoy = (current: number | null, prior: number | null): number | null => {
    if (current === null || prior === null || prior === 0) return null;
    return ((current - prior) / Math.abs(prior)) * 100;
  };

  /*
   * Year-on-year growth needs two comparable twelve-month windows. The
   * trailing aggregate is the current one; the previous full fiscal year is the
   * baseline. Comparing a TTM figure against a sum of whatever four quarterly
   * points happened to be returned is what produced the wild "+309%" readings -
   * many IDX names only return three quarters, so that sum covered nine months.
   *
   * Both sides are in the reporting currency, so the ratio is unit-free and the
   * scale correction does not apply here.
   */
  const prior = fund.priorAnnual;
  const revenueYoY = yoy(ttm.revenue, prior?.revenue ?? null);
  const netIncomeYoY = yoy(ttm.netIncome, prior?.netIncome ?? null);

  // Quarter-on-quarter, using the two most recent reported quarters.
  const withRevenue = quarters.filter((q) => q.revenue !== null);
  const lastQuarterRev = withRevenue.at(-1)?.revenue ?? null;
  const prevQuarterRev = withRevenue.at(-2)?.revenue ?? null;
  const revenueQoQ = yoy(lastQuarterRev, prevQuarterRev);

  /* ---------------------------- Profitability --------------------------- */
  const grossMargin = rev && grossProfit !== null ? (grossProfit / rev) * 100 : null;
  const operatingMargin = rev && ebit !== null ? (ebit / rev) * 100 : null;
  const netMargin = rev && ni !== null ? (ni / rev) * 100 : null;
  const roe = equity && ni !== null ? (ni / equity) * 100 : null;
  const roa = totalAssets && ni !== null ? (ni / totalAssets) * 100 : null;

  /* ------------------------------ Valuation ----------------------------- */
  const pe = marketCap && ni && ni > 0 ? marketCap / ni : null;
  const pb = marketCap && equity && equity > 0 ? marketCap / equity : null;
  const ps = marketCap && rev && rev > 0 ? marketCap / rev : null;
  const evEbitda =
    marketCap && ebit && ebit > 0 && totalDebt !== null
      ? (marketCap + totalDebt) / ebit
      : null;

  /* ------------------------------- Health ------------------------------- */
  const debtToEquity =
    equity && equity > 0 && totalDebt !== null ? totalDebt / equity : null;
  const currentRatio =
    ttm.currentAssets !== null && ttm.currentLiabilities && ttm.currentLiabilities > 0
      ? ttm.currentAssets / ttm.currentLiabilities
      : null;
  const netDebtToEbit =
    totalDebt !== null && ebit && ebit > 0 ? totalDebt / ebit : null;

  /* ------------------------------ Verdicts ------------------------------ */
  const verdicts: FundamentalVerdict[] = [];
  const push = (v: FundamentalVerdict) => verdicts.push(v);

  if (revenueYoY !== null) {
    const score = clamp(revenueYoY * 3, -100, 100);
    push({
      key: "revenue-growth",
      label: `Pertumbuhan Pendapatan ${revenueYoY >= 0 ? "+" : ""}${revenueYoY.toFixed(1)}%`,
      score,
      detail:
        revenueYoY > 20 ? "Ekspansi sangat kuat" :
        revenueYoY > 5 ? "Ekspansi sehat" :
        revenueYoY > -5 ? "Stagnan" : "Kontraksi",
      bias: score > 15 ? "bullish" : score < -15 ? "bearish" : "neutral",
    });
  }

  if (netIncomeYoY !== null) {
    const score = clamp(netIncomeYoY * 2.2, -100, 100);
    push({
      key: "profit-growth",
      label: `Pertumbuhan Laba ${netIncomeYoY >= 0 ? "+" : ""}${netIncomeYoY.toFixed(1)}%`,
      score,
      detail:
        netIncomeYoY > 20 ? "Laba tumbuh sangat cepat" :
        netIncomeYoY > 5 ? "Laba bertumbuh" :
        netIncomeYoY > -5 ? "Laba datar" : "Laba menurun",
      bias: score > 15 ? "bullish" : score < -15 ? "bearish" : "neutral",
    });
  }

  if (roe !== null) {
    const score = ramp(roe, 25, 0) ?? 0;
    push({
      key: "roe",
      label: `ROE ${pct(roe)}`,
      score,
      detail:
        roe >= 20 ? "Sangat efisiyet -return modal tinggi" :
        roe >= 12 ? "Efisiyet" :
        roe >= 6 ? "Moderat" : "Rendah",
      bias: score > 15 ? "bullish" : score < -15 ? "bearish" : "neutral",
    });
  }

  if (netMargin !== null) {
    const score = ramp(netMargin, 25, 0) ?? 0;
    push({
      key: "net-margin",
      label: `Margin Bersih ${pct(netMargin)}`,
      score,
      detail:
        netMargin >= 20 ? "Margin sangat gemuk" :
        netMargin >= 10 ? "Margin sehat" :
        netMargin >= 3 ? "Margin tipis" : "Rugi bersih",
      bias: score > 15 ? "bullish" : score < -15 ? "bearish" : "neutral",
    });
  }

  if (pe !== null) {
    // Indonesian market context: PE 6 = deep value, PE 30+ = expensive.
    const score = ramp(-pe, -30, -6) ?? 0;
    push({
      key: "pe",
      label: `PER ${ratio(pe)}x`,
      score,
      detail:
        pe < 8 ? "Sangat murah relatif terhadap fundamental" :
        pe < 12 ? "Murah" :
        pe < 20 ? "Wajar" :
        pe < 30 ? "Mahal" : "Sangat mahal / speculateif",
      bias: score > 15 ? "bullish" : score < -15 ? "bearish" : "neutral",
    });
  }

  if (pb !== null) {
    const score = ramp(-pb, -8, -0.8) ?? 0;
    push({
      key: "pb",
      label: `PBV ${ratio(pb)}x`,
      score,
      detail:
        pb < 1 ? "Di bawah nilai buku (diskon aset)" :
        pb < 2 ? "Wajar" :
        pb < 4 ? "Premium" : "Saham growth diberi premium tinggi",
      bias: score > 15 ? "bullish" : score < -15 ? "bearish" : "neutral",
    });
  }

  if (debtToEquity !== null) {
    const score = ramp(-debtToEquity, -0.5, -2.5) ?? 0;
    push({
      key: "debt",
      label: `DER ${ratio(debtToEquity)}x`,
      score,
      detail:
        debtToEquity < 0.5 ? "Sangat sedikit utang - ruang aman besar" :
        debtToEquity < 1 ? "Utang terkendali" :
        debtToEquity < 2 ? "Utang cukup tinggi" : "Leverage tinggi - perlu diwaspadai",
      bias: score > 15 ? "bullish" : score < -15 ? "bearish" : "neutral",
    });
  }

  if (currentRatio !== null) {
    const score = ramp(currentRatio, 2.5, 0.8) ?? 0;
    push({
      key: "liquidity",
      label: `Current Ratio ${ratio(currentRatio)}x`,
      score,
      detail:
        currentRatio >= 2 ? "Likuiditas sangat baik" :
        currentRatio >= 1.2 ? "Likuiditas aman" :
        currentRatio >= 1 ? "Ketat" : "Risiko likuiditas jangka pendek",
      bias: score > 15 ? "bullish" : score < -15 ? "bearish" : "neutral",
    });
  }

  /* -------------------------------- Score ------------------------------- */
  const weights: Record<string, number> = {
    "revenue-growth": 1.2,
    "profit-growth": 1.3,
    roe: 1.4,
    "net-margin": 0.8,
    pe: 1.1,
    pb: 0.6,
    debt: 0.9,
    liquidity: 0.5,
  };

  let weighted = 0;
  let weightSum = 0;
  for (const v of verdicts) {
    const w = weights[v.key] ?? 1;
    weighted += v.score * w;
    weightSum += w;
  }
  const score = weightSum > 0 ? clamp(weighted / weightSum, -100, 100) : 0;
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  const coverage = clamp((weightSum / totalWeight) * 100, 0, 100);

  const metrics: FundamentalMetric[] = [
    { key: "re", label: "Pendapatan (TTM)", value: rev, formatted: `Rp ${rupiah(rev)}`, band: "" },
    { key: "ni", label: "Laba Bersih (TTM)", value: ni, formatted: `Rp ${rupiah(ni)}`, band: "" },
    { key: "eps", label: "EPS (TTM)", value: ttm.eps, formatted: `Rp ${ttm.eps !== null ? Math.round(ttm.eps).toLocaleString("id-ID") : "-"}`, band: "" },
    { key: "mcap", label: "Kapitalisasi Pasar", value: marketCap, formatted: `Rp ${rupiah(marketCap)}`, band: "" },
    { key: "roe", label: "ROE", value: roe, formatted: pct(roe), band: "baik > 15%" },
    { key: "roa", label: "ROA", value: roa, formatted: pct(roa), band: "baik > 8%" },
    { key: "gm", label: "Margin Kotor", value: grossMargin, formatted: pct(grossMargin), band: "" },
    { key: "om", label: "Margin Operasional", value: operatingMargin, formatted: pct(operatingMargin), band: "" },
    { key: "nm", label: "Margin Bersih", value: netMargin, formatted: pct(netMargin), band: "baik > 12%" },
    { key: "pe", label: "PER", value: pe, formatted: `${ratio(pe)}x`, band: "murah < 12x" },
    { key: "pb", label: "PBV", value: pb, formatted: `${ratio(pb)}x`, band: "murah < 1.5x" },
    { key: "ps", label: "PSR", value: ps, formatted: `${ratio(ps)}x`, band: "" },
    { key: "der", label: "DER", value: debtToEquity, formatted: `${ratio(debtToEquity)}x`, band: "aman < 1x" },
    { key: "cr", label: "Current Ratio", value: currentRatio, formatted: `${ratio(currentRatio)}x`, band: "aman > 1.2x" },
    { key: "ndEbit", label: "Net Debt/EBIT", value: netDebtToEbit, formatted: `${ratio(netDebtToEbit)}x`, band: "aman < 3x" },
    { key: "fcf", label: "Free Cash Flow (TTM)", value: freeCashFlow, formatted: `Rp ${rupiah(freeCashFlow)}`, band: "" },
  ];

  return {
    available: true,
    period: latest.asOfDate,
    metrics,
    verdicts,
    score,
    coverage,
    growth: { revenueYoY, netIncomeYoY, revenueQoQ },
    profitability: { grossMargin, operatingMargin, netMargin, roe, roa },
    valuation: { pe, pb, ps, evEbitda },
    health: { debtToEquity, currentRatio, netDebtToEbit },
  };
}
