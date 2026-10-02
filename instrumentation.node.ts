import { initDb, isLocalFileDb } from "./lib/db";
import { UNIVERSE } from "./lib/universe";
import { getDaily, getFundamentals, pruneCache } from "./lib/yahoo";

/**
 * Cache warm-up, Node.js runtime only.
 *
 * The free upstream API has no bulk endpoint, so a cold database would make the
 * first page load take many seconds while ~100 individual requests happen. The
 * work is deliberately deferred: `register()` must return promptly so the server
 * starts accepting traffic, and a cold cache only costs latency on the very
 * first request, not correctness.
 */
export function scheduleWarmup(): void {
  const timer = setTimeout(() => {
    warm().catch((err) => console.warn("[warmup] failed:", err?.message ?? err));
  }, 1_500);

  // Never hold the process open just to warm a cache.
  timer.unref?.();
}

async function warm(): Promise<void> {
  await initDb();
  await pruneCache();

  const symbols = UNIVERSE.map((s) => s.symbol);
  const started = Date.now();

  // Bounded fan-out: polite to the upstream API, and fast enough to finish
  // well before a user clicks through the dashboard.
  const CONCURRENCY = 8;
  let cursor = 0;
  let ok = 0;

  async function worker(): Promise<void> {
    while (cursor < symbols.length) {
      const symbol = symbols[cursor++];
      try {
        // Daily history feeds every indicator; reports feed fundamentals.
        // Intraday is skipped here - it is short-TTL and fetched on demand.
        await Promise.all([getDaily(symbol), getFundamentals(symbol)]);
        ok++;
      } catch {
        // Individual failures are expected (thin coverage on some names).
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const mode = isLocalFileDb() ? "local SQLite" : "remote libSQL";
  console.log(
    `[warmup] cached ${ok}/${symbols.length} symbols in ${Date.now() - started}ms (${mode})`,
  );
}
