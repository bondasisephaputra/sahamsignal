import { UNIVERSE } from "./universe";

/**
 * Static descriptive metadata for the settings screen.
 *
 * Kept in its own module so a Server Component can read it without pulling the
 * rest of the analysis pipeline (and its `server-only` imports) into the graph.
 */

/** All sector labels present in the curated universe. */
export const ALL_SECTORS: string[] = [
  ...new Set(UNIVERSE.map((s) => s.sector)),
].sort((a, b) => a.localeCompare(b, "id"));

export interface EngineInfo {
  label: string;
  detail: string;
}

export const TECHNICAL_INDICATORS: EngineInfo[] = [
  { label: "MA 20/50/200", detail: "Struktur tren dan golden/death cross" },
  { label: "RSI(14)", detail: "Kekuatan relatif, deteksi zona jenuh beli dan jual" },
  { label: "MACD(12,26,9)", detail: "Momentum dan histogram arah" },
  { label: "Bollinger(20,2)", detail: "Posisi harga dalam pita volatilitas" },
  { label: "Stochastic(14,3,3)", detail: "Crossover %K dan %D" },
  { label: "ADX(14) / DMI", detail: "Kekuatan tren dan arah dominan" },
  { label: "ATR(14)", detail: "Volatilitas untuk stop loss dan ukuran posisi" },
  { label: "Volume relatif", detail: "Konfirmasi volume dibanding rata-rata 20 hari" },
  { label: "Support/Resistance", detail: "Pivot point dan cluster swing high/low" },
];

export const FUNDAMENTAL_RATIOS: EngineInfo[] = [
  { label: "Pertumbuhan pendapatan", detail: "12 bulan terakhir vs fiscal year sebelumnya" },
  { label: "Pertumbuhan laba bersih", detail: "Tren laba year-on-year" },
  { label: "ROE / ROA", detail: "Efisiensi modal dan aset" },
  { label: "Margin kotor, operasional, bersih", detail: "Struktur profitabilitas" },
  { label: "PER / PBV / PSR", detail: "Valuasi relatif terhadap fundamental" },
  { label: "DER", detail: "Leverage terhadap modal sendiri" },
  { label: "Current ratio", detail: "Kemampuan memenuhi kewajiban jangka pendek" },
];

export const SCORING_WEIGHTS: EngineInfo[] = [
  { label: "Komponen teknikal", detail: "Bobot 60% terhadap skor gabungan" },
  { label: "Komponen fundamental", detail: "Bobot 40% terhadap skor gabungan" },
  { label: "Bobot per indikator", detail: "Tren MA 1,6 · RSI/MACD 1,2 · ADX 1,0 · Bollinger 0,9 · Momentum 0,9 · Stokastik 0,8 · Volume 0,7" },
  { label: "Skala skor", detail: "-100 (jual kuat) hingga +100 (beli kuat)" },
  { label: "Ambang sinyal", detail: "≥55 beli kuat · ≥25 beli · ≥10 akumulasi · -10..10 tahan · ≤-25 jual · ≤-55 jual kuat" },
];

export const REFRESH_POLICY: EngineInfo[] = [
  { label: "Kuotasi intraday", detail: "45 detik saat pasar buka, 1 jam saat tutup" },
  { label: "Candlestick harian", detail: "5 menit saat pasar buka, 30 menit saat tutup" },
  { label: "Data fundamental", detail: "12 jam - laporan keuangan hanya berubah saat pelaporan" },
  { label: "Pemindaian universe", detail: "144 saham IDX liquid, dimuat otomatis saat server berjalan" },
];