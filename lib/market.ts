/**
 * IDX (Bursa Efek Indonesia) trading calendar helpers.
 *
 * Sessions run in WIB (UTC+7):
 *   Pre-open  08:30 - 09:00  (opening auction)
 *   Session I 09:00 - 12:00
 *   Lunch     12:00 - 13:30
 *   Session II 13:30 - 15:50
 *
 * Public holidays are not hard-coded; a `market_holidays` table can be
 * extended later. The weekday + hour check is what drives cache TTLs and the
 * "live" indicator in the UI.
 */

const WIB_OFFSET_MIN = 7 * 60;

export type MarketPhase =
  | "pre-open"
  | "session-1"
  | "lunch-break"
  | "session-2"
  | "closed"
  | "weekend"
  | "holiday";

export interface MarketStatus {
  phase: MarketPhase;
  isOpen: boolean;
  label: string;
  /** WIB clock time, HH:MM */
  wibTime: string;
  /** WIB calendar date, YYYY-MM-DD */
  wibDate: string;
  wibWeekday: string;
  /** ISO timestamp of the next phase transition, when known. */
  nextChangeAt: string | null;
}

/** Current time expressed as WIB wall-clock parts. */
export function wibNow(now: Date = new Date()): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
  dateKey: string;
} {
  const utcMs = now.getTime() + WIB_OFFSET_MIN * 60_000;
  const d = new Date(utcMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    // 0 = Sunday
    weekday: d.getUTCDay(),
    dateKey: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
  };
}

const WEEKDAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

const PHASE_LABEL: Record<MarketPhase, string> = {
  "pre-open": "Pre-Opening",
  "session-1": "Sesi I",
  "lunch-break": "Istirahat Siang",
  "session-2": "Sesi II",
  closed: "Saham Tutup",
  weekend: "Akhir Pekan",
  holiday: "Hari Libur",
};

export function getMarketStatus(now: Date = new Date()): MarketStatus {
  const w = wibNow(now);
  const time = `${String(w.hour).padStart(2, "0")}:${String(w.minute).padStart(2, "0")}`;
  const wibWeekday = WEEKDAYS[w.weekday];

  let phase: MarketPhase;
  if (w.weekday === 0 || w.weekday === 6) {
    phase = "weekend";
  } else if (w.hour < 9) {
    phase = "pre-open";
  } else if (w.hour < 12) {
    phase = "session-1";
  } else if (w.hour < 13 || (w.hour === 13 && w.minute < 30)) {
    phase = "lunch-break";
  } else if (w.hour < 15 || (w.hour === 15 && w.minute < 50)) {
    phase = "session-2";
  } else {
    phase = "closed";
  }

  const isOpen = phase === "session-1" || phase === "session-2" || phase === "pre-open";

  return {
    phase,
    isOpen,
    label: PHASE_LABEL[phase],
    wibTime: time,
    wibDate: w.dateKey,
    wibWeekday,
    nextChangeAt: nextTransition(w.hour, w.minute),
  };
}

function nextTransition(hour: number, minute: number): string | null {
  const marks: Array<[number, number]> = [
    [9, 0],
    [12, 0],
    [13, 30],
    [15, 50],
  ];
  const next = marks.find(([h, m]) => hour * 60 + minute < h * 60 + m);
  if (!next) return null;
  return `${String(next[0]).padStart(2, "0")}:${String(next[1]).padStart(2, "0")} WIB`;
}

/** Seconds a cached payload should stay fresh, given what it holds. */
export function cacheTtlSeconds(kind: "intraday" | "daily" | "fundamentals"): number {
  const { isOpen } = getMarketStatus();

  if (kind === "intraday") return isOpen ? 45 : 60 * 60;
  if (kind === "daily") return isOpen ? 5 * 60 : 30 * 60;
  // Reported financials only change on filing days.
  return 12 * 60 * 60;
}
