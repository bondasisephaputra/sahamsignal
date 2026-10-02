import "server-only";

import { randomUUID } from "node:crypto";

import { execute, select } from "./db";
import { normalizeSymbol } from "./yahoo";

export interface WatchlistItem {
  id: string;
  symbol: string;
  note: string | null;
  createdAt: number;
}

interface WatchlistRow {
  id: string;
  symbol: string;
  note: string | null;
  created_at: number;
}

export async function listWatchlist(userId: string): Promise<WatchlistItem[]> {
  const rows = await select<WatchlistRow>(
    "SELECT id, symbol, note, created_at FROM watchlist WHERE user_id = ? ORDER BY created_at DESC",
    [userId],
  );
  return rows.map((r) => ({
    id: r.id,
    symbol: r.symbol,
    note: r.note,
    createdAt: r.created_at,
  }));
}

export async function addToWatchlist(
  userId: string,
  rawSymbol: string,
  note?: string | null,
): Promise<WatchlistItem> {
  const symbol = normalizeSymbol(rawSymbol);
  if (!symbol) throw new Error("Kode saham tidak valid (harus 4 huruf, contoh: BBCA).");

  const existing = await select<WatchlistRow>(
    "SELECT id, symbol, note, created_at FROM watchlist WHERE user_id = ? AND symbol = ?",
    [userId, symbol],
  );
  if (existing.length > 0) return toItem(existing[0]);

  const item: WatchlistItem = {
    id: randomUUID(),
    symbol,
    note: note?.trim() || null,
    createdAt: Date.now(),
  };

  await execute(
    "INSERT INTO watchlist (id, user_id, symbol, note, created_at) VALUES (?, ?, ?, ?, ?)",
    [item.id, userId, item.symbol, item.note, item.createdAt],
  );
  return item;
}

export async function removeFromWatchlist(userId: string, symbol: string): Promise<void> {
  const bare = normalizeSymbol(symbol);
  if (!bare) return;
  await execute("DELETE FROM watchlist WHERE user_id = ? AND symbol = ?", [userId, bare]);
}

/** Reorder is not exposed in the UI; bulk clear is the only multi-op. */
export async function clearWatchlist(userId: string): Promise<void> {
  await execute("DELETE FROM watchlist WHERE user_id = ?", [userId]);
}

export async function updateNote(
  userId: string,
  symbol: string,
  note: string | null,
): Promise<void> {
  const bare = normalizeSymbol(symbol);
  if (!bare) return;
  await execute("UPDATE watchlist SET note = ? WHERE user_id = ? AND symbol = ?", [
    note?.trim() || null,
    userId,
    bare,
  ]);
}

function toItem(row: WatchlistRow): WatchlistItem {
  return { id: row.id, symbol: row.symbol, note: row.note, createdAt: row.created_at };
}
