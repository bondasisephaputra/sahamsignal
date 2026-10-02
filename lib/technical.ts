import type { Candle } from "./yahoo";

/**
 * Technical indicator library.
 *
 * Everything here is pure and synchronous so it can be unit-tested and reused
 * on both the server and the client. Series are always chronological
 * (oldest -> newest); the last element is "now".
 */

/* -------------------------------------------------------------------------- */
/*                              Moving averages                               */
/* -------------------------------------------------------------------------- */

export function sma(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (period <= 0) return out;

  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (values.length < period || period <= 0) return out;

  const k = 2 / (period + 1);
  // Seed with a simple average of the first `period` values.
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;

  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Last non-null value of a nullable series. */
export function lastOf(series: Array<number | null>): number | null {
  for (let i = series.length - 1; i >= 0; i--) {
    const v = series[i];
    if (v !== null && Number.isFinite(v)) return v;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/*                             Oscillators (RSI)                              */
/* -------------------------------------------------------------------------- */

/**
 * Relative Strength Index using Wilder's smoothing (the standard definition,
 * as opposed to a simple moving average of gains/losses).
 */
export function rsi(values: number[], period = 14): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (values.length <= period) return out;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const delta = values[i] - values[i - 1];
    if (delta >= 0) gainSum += delta;
    else lossSum -= delta;
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < values.length; i++) {
    const delta = values[i] - values[i - 1];
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*                                    MACD                                    */
/* -------------------------------------------------------------------------- */

export interface MacdResult {
  macd: Array<number | null>;
  signal: Array<number | null>;
  histogram: Array<number | null>;
}

export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9): MacdResult {
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);

  const macdLine: Array<number | null> = values.map((_, i) => {
    const f = emaFast[i];
    const s = emaSlow[i];
    return f !== null && s !== null ? f - s : null;
  });

  // EMA of the MACD line, computed over the contiguous defined region only.
  const firstIdx = macdLine.findIndex((v) => v !== null);
  const signal: Array<number | null> = new Array(values.length).fill(null);
  if (firstIdx >= 0) {
    const defined = macdLine.slice(firstIdx).map((v) => v as number);
    const sigDefined = ema(defined, signalPeriod);
    for (let i = 0; i < sigDefined.length; i++) signal[firstIdx + i] = sigDefined[i];
  }

  const histogram = macdLine.map((m, i) =>
    m !== null && signal[i] !== null ? m - (signal[i] as number) : null,
  );

  return { macd: macdLine, signal, histogram };
}

/* -------------------------------------------------------------------------- */
/*                             Bollinger Bands                                */
/* -------------------------------------------------------------------------- */

export interface BollingerResult {
  upper: Array<number | null>;
  middle: Array<number | null>;
  lower: Array<number | null>;
  /** %B: where price sits inside the band (0 = lower, 1 = upper). */
  percentB: Array<number | null>;
  bandwidth: Array<number | null>;
}

export function bollinger(values: number[], period = 20, mult = 2): BollingerResult {
  const middle = sma(values, period);
  const upper: Array<number | null> = new Array(values.length).fill(null);
  const lower: Array<number | null> = new Array(values.length).fill(null);
  const percentB: Array<number | null> = new Array(values.length).fill(null);
  const bandwidth: Array<number | null> = new Array(values.length).fill(null);

  for (let i = period - 1; i < values.length; i++) {
    const win = values.slice(i - period + 1, i + 1);
    const mean = middle[i] as number;
    const variance = win.reduce((acc, v) => acc + (v - mean) ** 2, 0) / period;
    const sd = Math.sqrt(variance);

    const u = mean + mult * sd;
    const l = mean - mult * sd;
    upper[i] = u;
    lower[i] = l;
    bandwidth[i] = mean !== 0 ? ((u - l) / mean) * 100 : null;
    percentB[i] = u - l !== 0 ? (values[i] - l) / (u - l) : 0.5;
  }

  return { upper, middle, lower, percentB, bandwidth };
}

/* -------------------------------------------------------------------------- */
/*                                  Stochastic                                */
/* -------------------------------------------------------------------------- */

export interface StochasticResult {
  k: Array<number | null>;
  d: Array<number | null>;
}

export function stochastic(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14,
  smoothK = 3,
  smoothD = 3,
): StochasticResult {
  const raw: Array<number | null> = new Array(closes.length).fill(null);

  for (let i = period - 1; i < closes.length; i++) {
    const hh = Math.max(...highs.slice(i - period + 1, i + 1));
    const ll = Math.min(...lows.slice(i - period + 1, i + 1));
    raw[i] = hh - ll !== 0 ? ((closes[i] - ll) / (hh - ll)) * 100 : 50;
  }

  const k = smooth(raw, smoothK);
  const d = smooth(k, smoothD);
  return { k, d };
}

/** Simple moving average over a nullable series, skipping gaps. */
function smooth(series: Array<number | null>, period: number): Array<number | null> {
  const out: Array<number | null> = new Array(series.length).fill(null);
  const buffer: number[] = [];

  for (let i = 0; i < series.length; i++) {
    const v = series[i];
    if (v !== null) buffer.push(v);
    if (buffer.length > period) buffer.shift();
    if (buffer.length === period && series[i] !== null) {
      out[i] = buffer.reduce((a, b) => a + b, 0) / period;
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*                                    ATR                                     */
/* -------------------------------------------------------------------------- */

/** Average True Range with Wilder smoothing. */
export function atr(candles: Candle[], period = 14): Array<number | null> {
  const out: Array<number | null> = new Array(candles.length).fill(null);
  if (candles.length <= period) return out;

  const trs: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const { h, l } = candles[i];
    const prevC = candles[i - 1].c;
    trs.push(Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC)));
  }

  let prev = trs.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
  out[period] = prev;

  for (let i = period + 1; i < candles.length; i++) {
    prev = (prev * (period - 1) + trs[i]) / period;
    out[i] = prev;
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*                                ADX / DMI                                   */
/* -------------------------------------------------------------------------- */

export interface AdxResult {
  adx: number | null;
  plusDI: number | null;
  minusDI: number | null;
}

/** Average Directional Index - measures trend strength regardless of direction. */
export function adx(candles: Candle[], period = 14): AdxResult {
  const empty: AdxResult = { adx: null, plusDI: null, minusDI: null };
  if (candles.length < period * 2 + 1) return empty;

  const plusDM: number[] = [0];
  const minusDM: number[] = [0];
  const tr: number[] = [0];

  for (let i = 1; i < candles.length; i++) {
    const up = candles[i].h - candles[i - 1].h;
    const down = candles[i - 1].l - candles[i].l;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);

    const { h, l } = candles[i];
    const prevC = candles[i - 1].c;
    tr.push(Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC)));
  }

  const wilder = (arr: number[], p: number): number[] => {
    const out: number[] = new Array(arr.length).fill(0);
    let prev = arr.slice(1, p + 1).reduce((a, b) => a + b, 0);
    out[p] = prev;
    for (let i = p + 1; i < arr.length; i++) {
      prev = prev - prev / p + arr[i];
      out[i] = prev;
    }
    return out;
  };

  const sTR = wilder(tr, period);
  const sPlus = wilder(plusDM, period);
  const sMinus = wilder(minusDM, period);

  const dx: number[] = new Array(candles.length).fill(0);
  let plusDI = 0;
  let minusDI = 0;

  for (let i = period; i < candles.length; i++) {
    if (sTR[i] === 0) continue;
    const pDI = (sPlus[i] / sTR[i]) * 100;
    const mDI = (sMinus[i] / sTR[i]) * 100;
    const denom = pDI + mDI;
    dx[i] = denom !== 0 ? (Math.abs(pDI - mDI) / denom) * 100 : 0;
    if (i === candles.length - 1) {
      plusDI = pDI;
      minusDI = mDI;
    }
  }

  const recent = dx.slice(candles.length - period);
  const adxValue = recent.length > 0 ? recent.reduce((a, b) => a + b, 0) / recent.length : null;

  return {
    adx: adxValue,
    plusDI: Number.isFinite(plusDI) ? plusDI : null,
    minusDI: Number.isFinite(minusDI) ? minusDI : null,
  };
}

/* -------------------------------------------------------------------------- */
/*                                    OBV                                     */
/* -------------------------------------------------------------------------- */

/** On-Balance Volume - cumulative volume signed by price direction. */
export function obv(candles: Candle[]): number[] {
  const out: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const diff = candles[i].c - candles[i - 1].c;
    const prev = out[i - 1];
    out.push(diff > 0 ? prev + candles[i].v : diff < 0 ? prev - candles[i].v : prev);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*                         Support / resistance levels                         */
/* -------------------------------------------------------------------------- */

export interface PriceLevels {
  supports: number[];
  resistances: number[];
  pivots: { r3: number; r2: number; r1: number; pp: number; s1: number; s2: number; s3: number } | null;
  stopCluster: number | null;
  targetCluster: number | null;
}

/**
 * Classic floor-trader pivots from the last completed bar, plus nearby
 * swing highs/lows detected over the last 60 bars.
 */
export function priceLevels(candles: Candle[]): PriceLevels {
  const result: PriceLevels = {
    supports: [],
    resistances: [],
    pivots: null,
    stopCluster: null,
    targetCluster: null,
  };
  if (candles.length < 20) return result;

  const last = candles[candles.length - 1];
  const range = last.h - last.l;
  if (range <= 0) return result;

  const pp = (last.h + last.l + last.c) / 3;
  result.pivots = {
    pp,
    r1: 2 * pp - last.l,
    r2: pp + range,
    r3: last.h + 2 * (pp - last.l),
    s1: 2 * pp - last.h,
    s2: pp - range,
    s3: last.l - 2 * (last.h - pp),
  };

  // Cluster swing points within 1.5% of each other and rank by touch count.
  const lookback = candles.slice(-60);
  const swingHighs = new Map<number, number>();
  const swingLows = new Map<number, number>();

  for (let i = 2; i < lookback.length - 2; i++) {
    const c = lookback[i];
    const isHigh =
      c.h >= lookback[i - 1].h && c.h >= lookback[i - 2].h &&
      c.h >= lookback[i + 1].h && c.h >= lookback[i + 2].h;
    const isLow =
      c.l <= lookback[i - 1].l && c.l <= lookback[i - 2].l &&
      c.l <= lookback[i + 1].l && c.l <= lookback[i + 2].l;

    if (isHigh) swingHighs.set(round(c.h), (swingHighs.get(round(c.h)) ?? 0) + 1);
    if (isLow) swingLows.set(round(c.l), (swingLows.get(round(c.l)) ?? 0) + 1);
  }

  const cluster = (m: Map<number, number>, tolerance: number): number[] =>
    [...m.keys()]
      .sort((a, b) => a - b)
      .reduce<number[]>((acc, level) => {
        if (acc.length > 0 && Math.abs(level - acc[acc.length - 1]) / level <= tolerance) {
          return acc;
        }
        acc.push(level);
        return acc;
      }, [])
      .sort((a, b) => (m.get(b) ?? 0) - (m.get(a) ?? 0))
      .slice(0, 4);

  const price = last.c;
  result.supports = cluster(swingLows, 0.015).filter((l) => l < price).sort((a, b) => b - a);
  result.resistances = cluster(swingHighs, 0.015).filter((l) => l > price).sort((a, b) => a - b);

  result.stopCluster = result.supports[0] ?? result.pivots.s1;
  result.targetCluster = result.resistances[0] ?? result.pivots.r1;

  return result;
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

/* -------------------------------------------------------------------------- */
/*                               Momentum / ROC                                */
/* -------------------------------------------------------------------------- */

/** Rate of change over `period` bars, as a percentage. */
export function roc(values: number[], period: number): number | null {
  if (values.length <= period) return null;
  const past = values[values.length - 1 - period];
  if (!past) return null;
  return ((values[values.length - 1] - past) / past) * 100;
}

/* -------------------------------------------------------------------------- */
/*                          Composite technical picture                       */
/* -------------------------------------------------------------------------- */

export interface TechnicalVerdict {
  key: string;
  label: string;
  /** Contribution to the technical score, -100..100. */
  score: number;
  detail: string;
  /** Trend favouring the signal. */
  bias: "bullish" | "bearish" | "neutral";
}

export interface TechnicalAnalysis {
  price: number;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  ema12: number | null;
  ema26: number | null;
  rsi14: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  bbUpper: number | null;
  bbLower: number | null;
  bbPercentB: number | null;
  stochK: number | null;
  stochD: number | null;
  atr: number | null;
  atrPercent: number | null;
  adx: number | null;
  plusDI: number | null;
  minusDI: number | null;
  relativeVolume: number | null;
  roc20: number | null;
  high52: number | null;
  low52: number | null;
  /** % of the 52-week range where price currently sits (0..100). */
  rangePosition: number | null;
  levels: PriceLevels;
  verdicts: TechnicalVerdict[];
  /** -100..100 weighted composite. */
  score: number;
  /** 0..100 - how much the indicators agree with each other. */
  confidence: number;
  trend: "uptrend" | "downtrend" | "sideways";
}

/** Clamp helper shared by both engines. */
export function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

export function analyzeTechnical(candles: Candle[], livePrice?: number): TechnicalAnalysis {
  const closes = candles.map((c) => c.c);
  const highs = candles.map((c) => c.h);
  const lows = candles.map((c) => c.l);
  const volumes = candles.map((c) => c.v);
  const price = livePrice ?? closes[closes.length - 1] ?? 0;

  const sma20 = lastOf(sma(closes, 20));
  const sma50 = lastOf(sma(closes, 50));
  const sma200 = lastOf(sma(closes, 200));
  const ema12 = lastOf(ema(closes, 12));
  const ema26 = lastOf(ema(closes, 26));

  const rsiSeries = rsi(closes, 14);
  const rsi14 = lastOf(rsiSeries);
  // Previous RSI, to detect a cross rather than just a level.
  const rsiPrev = rsiSeries.length > 1 ? lastOf(rsiSeries.slice(0, -1)) : null;

  const macdRes = macd(closes);
  const macdLine = lastOf(macdRes.macd);
  const macdSig = lastOf(macdRes.signal);
  const macdHist = lastOf(macdRes.histogram);
  const macdHistPrev = lastOf(macdRes.histogram.slice(0, -1));

  const bb = bollinger(closes, 20, 2);
  const bbUpper = lastOf(bb.upper);
  const bbLower = lastOf(bb.lower);
  const bbPercentB = lastOf(bb.percentB);

  const stoch = stochastic(highs, lows, closes, 14, 3, 3);
  const stochK = lastOf(stoch.k);
  const stochD = lastOf(stoch.d);

  const atrSeries = atr(candles, 14);
  const atr14 = lastOf(atrSeries);
  const atrPct = atr14 !== null && price > 0 ? (atr14 / price) * 100 : null;

  const dmi = adx(candles, 14);

  const avgVolSeries = sma(volumes, 20);
  const avgVol = lastOf(avgVolSeries.slice(0, -1));
  const lastVol = volumes[volumes.length - 1] ?? 0;
  const relativeVolume = avgVol && avgVol > 0 ? lastVol / avgVol : null;

  const roc20 = roc(closes, 20);

  const window52 = closes.slice(-252);
  const high52 = window52.length ? Math.max(...window52) : null;
  const low52 = window52.length ? Math.min(...window52) : null;
  const rangePosition =
    high52 !== null && low52 !== null && high52 > low52
      ? ((price - low52) / (high52 - low52)) * 100
      : null;

  const levels = priceLevels(candles);

  /* ------------------------------- Verdicts ------------------------------ */
  const verdicts: TechnicalVerdict[] = [];

  // 1. Moving-average structure (the single most important trend test).
  if (sma20 !== null && sma50 !== null) {
    const golden = sma20 > sma50;
    const above = price > sma20;
    let score = 0;
    score += golden ? 30 : -30;
    score += above ? 20 : -20;
    if (sma200 !== null) score += sma50 > sma200 ? 25 : -25;
    verdicts.push({
      key: "ma-trend",
      label: "Tren Moving Average",
      score: clamp(score, -100, 100),
      detail: `MA20 ${fmt(sma20)} · MA50 ${fmt(sma50)}${sma200 !== null ? ` · MA200 ${fmt(sma200)}` : ""}`,
      bias: score > 15 ? "bullish" : score < -15 ? "bearish" : "neutral",
    });
  }

  // 2. RSI - reward strength, penalise extremes.
  if (rsi14 !== null) {
    let score: number;
    if (rsi14 >= 70) score = -40 - (rsi14 - 70) * 2; // overbought
    else if (rsi14 <= 30) score = 40 + (30 - rsi14) * 2; // oversold bounce
    else score = (rsi14 - 50) * 1.6; // momentum tilt

    // A cross out of the extreme zone is a stronger signal than a level.
    if (rsiPrev !== null && rsiPrev <= 30 && rsi14 > 30) score += 35;
    if (rsiPrev !== null && rsiPrev >= 70 && rsi14 < 70) score -= 35;

    verdicts.push({
      key: "rsi",
      label: `RSI(14) ${rsi14.toFixed(1)}`,
      score: clamp(score, -100, 100),
      detail:
        rsi14 >= 70 ? "Zona jenuh beli (overbought)" :
        rsi14 <= 30 ? "Zona jenuh jual (oversold)" :
        "Zona netral",
      bias: score > 15 ? "bullish" : score < -15 ? "bearish" : "neutral",
    });
  }

  // 3. MACD - line vs signal plus histogram momentum.
  if (macdLine !== null && macdSig !== null) {
    const diff = macdLine - macdSig;
    let score = clamp(diff / (price * 0.01) * 30, -70, 70);
    if (macdHist !== null && macdHistPrev !== null) {
      const expanding = Math.abs(macdHist) > Math.abs(macdHistPrev);
      const sign = Math.sign(macdHist);
      score += expanding ? sign * 25 : -sign * 10;
    }
    verdicts.push({
      key: "macd",
      label: "MACD (12,26,9)",
      score: clamp(score, -100, 100),
      detail: `${diff >= 0 ? "Garis MACD di atas signal" : "Garis MACD di bawah signal"} · histogram ${
        (macdHist ?? 0) >= 0 ? "positif" : "negatif"
      }`,
      bias: score > 15 ? "bullish" : score < -15 ? "bearish" : "neutral",
    });
  }

  // 4. Bollinger position - buy the lower band, sell the upper.
  if (bbPercentB !== null && bbUpper !== null && bbLower !== null) {
    const score = (0.5 - bbPercentB) * 200; // %B 0 -> +100, %B 1 -> -100
    verdicts.push({
      key: "bollinger",
      label: "Bollinger Bands (20,2)",
      score: clamp(score, -100, 100),
      detail: `%B ${bbPercentB.toFixed(2)} · lower ${fmt(bbLower)} · upper ${fmt(bbUpper)}`,
      bias: score > 15 ? "bullish" : score < -15 ? "bearish" : "neutral",
    });
  }

  // 5. Stochastic crossover.
  if (stochK !== null && stochD !== null) {
    let score = (50 - stochK) * 1.6;
    const crossedUp = stochK > stochD;
    if (stochK < 20 && crossedUp) score += 30;
    if (stochK > 80 && !crossedUp) score -= 30;
    verdicts.push({
      key: "stochastic",
      label: `Stochastic ${stochK.toFixed(0)}/${stochD.toFixed(0)}`,
      score: clamp(score, -100, 100),
      detail: crossedUp ? "%K di atas %D (bullish cross)" : "%K di bawah %D (bearish cross)",
      bias: score > 15 ? "bullish" : score < -15 ? "bearish" : "neutral",
    });
  }

  // 6. Trend strength via ADX.
  if (dmi.adx !== null && dmi.plusDI !== null && dmi.minusDI !== null) {
    const dir = Math.sign(dmi.plusDI - dmi.minusDI);
    const strength = Math.min((dmi.adx - 20) / 30, 1); // 0 below 20, 1 above 50
    const score = clamp(dir * strength * 80, -100, 100);
    verdicts.push({
      key: "adx",
      label: `ADX ${dmi.adx.toFixed(0)}`,
      score,
      detail:
        dmi.adx >= 25
          ? `Tren ${dir > 0 ? "naik" : "turun"} kuat (+DI ${dmi.plusDI.toFixed(0)} / -DI ${dmi.minusDI.toFixed(0)})`
          : "Tren lemah / sideways",
      bias: score > 15 ? "bullish" : score < -15 ? "bearish" : "neutral",
    });
  }

  // 7. Volume confirmation.
  if (relativeVolume !== null) {
    const score = clamp((relativeVolume - 1) * 60, -60, 60);
    verdicts.push({
      key: "volume",
      label: `Volume ${relativeVolume.toFixed(2)}x rata-rata`,
      score,
      detail:
        relativeVolume >= 1.3
          ? "Volume di atas rata-rata - konfirmasi kuat"
          : relativeVolume <= 0.7
            ? "Volume tipis - pasar tidak yakin"
            : "Volume normal",
      bias: score > 15 ? "bullish" : score < -15 ? "bearish" : "neutral",
    });
  }

  // 8. 20-day momentum.
  if (roc20 !== null) {
    const score = clamp(roc20 * 3, -100, 100);
    verdicts.push({
      key: "momentum",
      label: `Momentum 20H ${roc20 >= 0 ? "+" : ""}${roc20.toFixed(1)}%`,
      score,
      detail: `Perubahan harga 20 hari perdagangan terakhir`,
      bias: score > 15 ? "bullish" : score < -15 ? "bearish" : "neutral",
    });
  }

  /* -------------------------------- Score -------------------------------- */
  const weights: Record<string, number> = {
    "ma-trend": 1.6,
    rsi: 1.2,
    macd: 1.2,
    bollinger: 0.9,
    stochastic: 0.8,
    adx: 1.0,
    volume: 0.7,
    momentum: 0.9,
  };

  let weighted = 0;
  let weightSum = 0;
  for (const v of verdicts) {
    const w = weights[v.key] ?? 1;
    weighted += v.score * w;
    weightSum += w;
  }
  const score = weightSum > 0 ? clamp(weighted / weightSum, -100, 100) : 0;

  // Confidence: agreement (low dispersion) + participation (ADX).
  let agreement = 0;
  if (verdicts.length > 0) {
    const mean = weighted / weightSum;
    const variance =
      verdicts.reduce((acc, v) => acc + (v.score - mean) ** 2, 0) / verdicts.length;
    agreement = clamp(100 - Math.sqrt(variance) * 1.1, 0, 100);
  }
  const participation = dmi.adx !== null ? clamp(((dmi.adx - 15) / 35) * 100, 0, 100) : 45;
  const coverage = clamp((verdicts.length / 8) * 100, 0, 100);
  const confidence = clamp(agreement * 0.55 + participation * 0.25 + coverage * 0.2, 0, 100);

  const trend: TechnicalAnalysis["trend"] =
    sma20 !== null && sma50 !== null && sma200 !== null
      ? sma20 > sma50 && sma50 > sma200
        ? "uptrend"
        : sma20 < sma50 && sma50 < sma200
          ? "downtrend"
          : "sideways"
      : "sideways";

  return {
    price,
    sma20,
    sma50,
    sma200,
    ema12,
    ema26,
    rsi14,
    macd: macdLine,
    macdSignal: macdSig,
    macdHistogram: macdHist,
    bbUpper,
    bbLower,
    bbPercentB,
    stochK,
    stochD,
    atr: atr14,
    atrPercent: atrPct,
    adx: dmi.adx,
    plusDI: dmi.plusDI,
    minusDI: dmi.minusDI,
    relativeVolume,
    roc20,
    high52,
    low52,
    rangePosition,
    levels,
    verdicts,
    score,
    confidence,
    trend,
  };
}

function fmt(v: number | null): string {
  return v === null ? "-" : v.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}
