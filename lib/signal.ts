import type { FundamentalAnalysis } from "./fundamental";
import type { TechnicalAnalysis } from "./technical";
import { clamp } from "./technical";

/**
 * Signal engine.
 *
 * Technical + fundamental scores are blended with configurable weights, then
 * mapped to an actionable recommendation together with concrete risk levels
 * (entry, stop loss, take profit) derived from ATR and support/resistance.
 */

export type SignalTier =
  | "STRONG_BUY"
  | "BUY"
  | "ACCUMULATE"
  | "HOLD"
  | "REDUCE"
  | "SELL"
  | "STRONG_SELL";

export interface SignalLevel {
  price: number;
  label: string;
  note: string;
}

export interface RiskPlan {
  entry: number;
  entryLow: number;
  entryHigh: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  takeProfit3: number;
  /** Reward-to-risk against takeProfit1. */
  riskReward: number;
  /** Distance from entry to stop, as a percentage. */
  stopDistancePercent: number;
  /** Suggested position size for Rp 10.000.000 capital at 2% risk. */
  suggestedLot: number;
  riskPerLot: number;
  atr: number | null;
}

export interface SignalResult {
  symbol: string;
  tier: SignalTier;
  /** Short Indonesian label, e.g. "BELI KUAT". */
  label: string;
  action: "buy" | "hold" | "sell";
  score: number;
  techScore: number;
  fundScore: number;
  confidence: number;
  price: number;
  changePercent: number;
  risk: RiskPlan;
  reasons: string[];
  cautions: string[];
  summary: string;
  generatedAt: number;
}

export const TIER_META: Record<
  SignalTier,
  { label: string; action: "buy" | "hold" | "sell"; tone: "strong-buy" | "buy" | "neutral" | "sell" | "strong-sell" }
> = {
  "STRONG_BUY": { label: "BELI KUAT", action: "buy", tone: "strong-buy" },
  BUY: { label: "BELI", action: "buy", tone: "buy" },
  ACCUMULATE: { label: "AKUMULASI", action: "buy", tone: "buy" },
  HOLD: { label: "TAHAN", action: "hold", tone: "neutral" },
  REDUCE: { label: "KURANGI", action: "sell", tone: "sell" },
  SELL: { label: "JUAL", action: "sell", tone: "sell" },
  "STRONG_SELL": { label: "JUAL KUAT", action: "sell", tone: "strong-sell" },
};

export interface SignalWeights {
  technical: number;
  fundamental: number;
}

const DEFAULT_WEIGHTS: SignalWeights = { technical: 0.6, fundamental: 0.4 };

/** Lot size for IDX equities is 100 shares. */
const LOT_SIZE = 100;
/** Capital used for the position-size suggestion. */
const REFERENCE_CAPITAL = 10_000_000;
/** Fraction of capital willing to lose per trade. */
const RISK_PER_TRADE = 0.02;

function tierFor(score: number): SignalTier {
  if (score >= 55) return "STRONG_BUY";
  if (score >= 25) return "BUY";
  if (score >= 10) return "ACCUMULATE";
  if (score > -10) return "HOLD";
  if (score > -25) return "REDUCE";
  if (score > -55) return "SELL";
  return "STRONG_SELL";
}

/**
 * Build a risk plan around the live price.
 *
 * Stop loss sits below the nearest real support, but never tighter than
 * 1.2x ATR (that filter prevents noise from knocking you out) and never
 * wider than 3x ATR (that filter prevents catastrophic per-trade risk).
 */
export function buildRiskPlan(
  price: number,
  tech: TechnicalAnalysis,
  tier: SignalTier,
  isBuy: boolean,
): RiskPlan {
  const atr = tech.atr;
  const fallbackAtr = price * 0.025;
  const effectiveAtr = atr && atr > 0 ? atr : fallbackAtr;

  const nearestSupport = tech.levels.supports[0] ?? null;
  const nearestResistance = tech.levels.resistances[0] ?? null;

  // --- Stop loss ---
  const atrStop = isBuy ? price - 2 * effectiveAtr : price + 2 * effectiveAtr;
  let stopLoss = atrStop;

  if (isBuy && nearestSupport !== null && nearestSupport < price) {
    const supportStop = nearestSupport * 0.985;
    // Use the support only if it is not tighter than 1.2 ATR.
    if (price - supportStop >= 1.2 * effectiveAtr) stopLoss = supportStop;
  }
  if (!isBuy && nearestResistance !== null && nearestResistance > price) {
    const resistanceStop = nearestResistance * 1.015;
    if (resistanceStop - price >= 1.2 * effectiveAtr) stopLoss = resistanceStop;
  }
  // Hard cap at 3x ATR either way.
  const maxDistance = 3 * effectiveAtr;
  stopLoss = isBuy
    ? Math.max(stopLoss, price - maxDistance)
    : Math.min(stopLoss, price + maxDistance);

  const riskPerShare = Math.abs(price - stopLoss) || effectiveAtr;

  // --- Entry zone ---
  const entryLow = price - 0.25 * effectiveAtr;
  const entryHigh = price + 0.5 * effectiveAtr;

  // --- Targets ---
  const target1 = isBuy ? price + 1.5 * riskPerShare : price - 1.5 * riskPerShare;
  const target2 = isBuy ? price + 2.5 * riskPerShare : price - 2.5 * riskPerShare;
  const target3 = isBuy ? price + 4 * riskPerShare : price - 4 * riskPerShare;

  const budget = REFERENCE_CAPITAL * RISK_PER_TRADE;
  const sharesByRisk = Math.floor(budget / riskPerShare);
  const suggestedLot = Math.max(0, Math.floor(sharesByRisk / LOT_SIZE));

  return {
    entry: roundLot(price),
    entryLow: roundLot(entryLow),
    entryHigh: roundLot(entryHigh),
    stopLoss: roundLot(stopLoss),
    takeProfit1: roundLot(target1),
    takeProfit2: roundLot(target2),
    takeProfit3: roundLot(target3),
    riskReward: round(1.5, 2),
    stopDistancePercent: round((riskPerShare / price) * 100, 2),
    suggestedLot,
    riskPerLot: round(riskPerShare * LOT_SIZE, 0),
    atr: atr && atr > 0 ? round(atr, 0) : null,
  };
}

/**
 * IDX prices move in increments of Rp 2 for stocks under Rp 2.000 and Rp 1
 * above that (the "tick size" is fractional at the low end, but rounding to
 * whole rupiah is what every broker display does).
 */
function roundLot(price: number): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  return Math.round(price);
}

function round(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

export interface SignalInput {
  symbol: string;
  price: number;
  changePercent: number;
  technical: TechnicalAnalysis;
  fundamental: FundamentalAnalysis;
  weights?: SignalWeights;
}

export function computeSignal(input: SignalInput): SignalResult {
  const { technical, fundamental, price } = input;
  const weights = input.weights ?? DEFAULT_WEIGHTS;

  // If fundamentals are missing entirely, fall back to a pure technical read
  // rather than pretending the fundamental half is neutral.
  const hasFund = fundamental.available;
  const wTech = hasFund ? weights.technical : 1;
  const wFund = hasFund ? weights.fundamental : 0;

  const blended = technical.score * wTech + fundamental.score * wFund;
  const totalW = wTech + wFund || 1;
  const score = clamp(blended / totalW, -100, 100);

  // Damp conviction when the two engines disagree.
  const divergence = Math.abs(technical.score - fundamental.score);
  const agreementPenalty = clamp(divergence / 2, 0, 30);
  const confidence = clamp(
    technical.confidence * 0.65 + fundamental.coverage * 0.2 + 15 - agreementPenalty * 0.5,
    5,
    98,
  );

  const tier = tierFor(score);
  const meta = TIER_META[tier];
  const isBuy = meta.action === "buy";

  const risk = buildRiskPlan(price, technical, tier, isBuy);

  /* ----------------------------- Narrative ------------------------------ */
  const reasons: string[] = [];
  const cautions: string[] = [];

  const bullish = technical.verdicts.filter((v) => v.bias === "bullish");
  const bearish = technical.verdicts.filter((v) => v.bias === "bearish");

  for (const v of bullish.slice(0, 4)) reasons.push(`[Teknikal] ${v.label} - ${v.detail}`);
  for (const v of fundamental.verdicts.filter((v) => v.bias === "bullish").slice(0, 4)) {
    reasons.push(`[Fundamental] ${v.label} - ${v.detail}`);
  }
  for (const v of bearish.slice(0, 3)) cautions.push(`[Teknikal] ${v.label} - ${v.detail}`);
  for (const v of fundamental.verdicts.filter((v) => v.bias === "bearish").slice(0, 3)) {
    cautions.push(`[Fundamental] ${v.label} - ${v.detail}`);
  }

  if (divergence > 40) {
    cautions.push(
      `Analisis teknikal dan fundamental divergen besar (${Math.round(divergence)} poin) - pertimbangkan ukuran posisi kecil.`,
    );
  }
  if (technical.trend === "sideways") {
    cautions.push("Tren sedang sideways - sinyal breakout perlu konfirmasi volume.");
  }
  if (technical.adx !== null && technical.adx < 20) {
    cautions.push(`ADX ${technical.adx.toFixed(0)} - belum ada tren yang kuat, risiko whipsaw tinggi.`);
  }
  if (!hasFund) {
    cautions.push("Data fundamental tidak tersedia - skor hanya berbasis analisis teknikal.");
  }
  if (technical.relativeVolume !== null && technical.relativeVolume < 0.7) {
    cautions.push("Volume tipis - likuiditas rendah, beware gap price.");
  }
  if (risk.stopDistancePercent > 8) {
    cautions.push(
      `Stop loss ${risk.stopDistancePercent}% - posisi relatif jauh, perkecil ukuran lot.`,
    );
  }
  if (reasons.length === 0) reasons.push("Tidak ada indikator yang memberi sinyal arah jelas.");

  const summary = buildSummary(input, tier, confidence);

  return {
    symbol: input.symbol,
    tier,
    label: meta.label,
    action: meta.action,
    score: round(score, 1),
    techScore: round(technical.score, 1),
    fundScore: round(fundamental.score, 1),
    confidence: Math.round(confidence),
    price: round(price, 0),
    changePercent: round(input.changePercent, 2),
    risk,
    reasons,
    cautions,
    summary,
    generatedAt: Date.now(),
  };
}

function buildSummary(input: SignalInput, tier: SignalTier, confidence: number): string {
  const { technical: t, fundamental: f } = input;
  const meta = TIER_META[tier];
  const conf = confidence >= 70 ? "keyakinan tinggi" : confidence >= 45 ? "keyakinan sedang" : "keyakinan rendah";

  const trendText =
    t.trend === "uptrend" ? "tren naik" : t.trend === "downtrend" ? "tren turun" : "sideways";
  const fundText = f.available
    ? `fundamental ${f.score >= 15 ? "menguat" : f.score <= -15 ? "melemah" : "netral"} (skor ${f.score.toFixed(0)})`
    : "fundamental tidak tersedia";

  return (
    `${meta.label} dengan ${conf}. Komposisi teknikal ${t.score.toFixed(0)} (${trendText}) ` +
    `dan ${fundText}. Level stops dan target ditentukan dari ATR serta support/resistance terdekat.`
  );
}
