/**
 * Presentation helpers. Kept dependency-free and side-effect-free so they can
 * run on the server or the client.
 */

/** Compact Indonesian rupiah: 1.234,5 jt / 12,3 M / 1,45 T. */
export function formatIDR(value: number | null | undefined, withPrefix = true): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  let body: string;
  if (abs >= 1e12) body = `${trim(abs / 1e12)} T`;
  else if (abs >= 1e9) body = `${trim(abs / 1e9)} M`;
  else if (abs >= 1e6) body = `${trim(abs / 1e6)} jt`;
  else if (abs >= 1e3) body = trim(abs / 1e3, 1);
  else body = trim(abs, 0);

  return `${sign}${withPrefix ? "Rp " : ""}${body}`;
}

function trim(v: number, digits = 2): string {
  const s = v.toFixed(digits);
  // Keep at most `digits` decimals, drop trailing zeros but keep one for 1.2 style.
  return s.replace(/\.?0+$/, "") || "0";
}

/** Price with thousands separators, no decimals (IDX quotes are integers). */
export function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return Math.round(value).toLocaleString("id-ID");
}

export function formatSigned(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  const s = value.toFixed(digits);
  return `${value > 0 ? "+" : ""}${s.replace(".", ",")}%`;
}

export function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return value.toFixed(digits).replace(".", ",");
}

export function formatCompactInt(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  if (value >= 1e9) return `${trim(value / 1e9)} M`;
  if (value >= 1e6) return `${trim(value / 1e6)} jt`;
  if (value >= 1e3) return `${trim(value / 1e3)} rb`;
  return String(Math.round(value));
}

/** ISO seconds -> "14:32" in WIB. */
export function formatWIBTime(unixSeconds: number | null | undefined): string {
  if (!unixSeconds) return "-";
  const d = new Date(unixSeconds * 1000 + 7 * 3600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** ISO seconds -> "12 Agu 2026, 14:32 WIB". */
export function formatWIBDateTime(unixSeconds: number | null | undefined): string {
  if (!unixSeconds) return "-";
  const d = new Date(unixSeconds * 1000 + 7 * 3600_000);
  const months = [
    "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
    "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
  ];
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} WIB`;
}

/** Short axis label for charts: "12 Agu". */
export function formatChartDate(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000 + 7 * 3600_000);
  const months = [
    "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
    "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
  ];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "baru saja";
  if (mins < 60) return `${mins} menit lalu`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return `${Math.round(hours / 24)} hari lalu`;
}

/** Report a reporting period like "2026-06-30" as "Kuis 2026". */
export function formatReportPeriod(iso: string | null): string {
  if (!iso) return "-";
  const [year, month] = iso.split("-");
  const m = Number(month);
  if (!year || !m) return iso;
  const q = Math.ceil(m / 3);
  return `Kuis ${q} ${year}`;
}
