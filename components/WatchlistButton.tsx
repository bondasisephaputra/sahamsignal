"use client";

import { useCallback, useState } from "react";

interface WatchlistButtonProps {
  symbol: string;
  /** Initial membership, so the first paint is already correct. */
  initialSaved?: boolean;
  className?: string;
}

/**
 * Toggle a symbol in the signed-in user's watchlist.
 *
 * Optimistic: the icon flips immediately and reverts if the request fails,
 * which keeps the button feeling instant on a slow connection.
 */
export function WatchlistButton({
  symbol,
  initialSaved = false,
  className = "btn-ghost btn-sm",
}: WatchlistButtonProps) {
  const [saved, setSaved] = useState(initialSaved);
  const [pending, setPending] = useState(false);

  // A new symbol (server navigation) means the previous optimistic value is
  // meaningless - reset during render rather than in an effect. An explicit
  // toggle keeps ownership of `saved` until the component is reused for a
  // different symbol.
  const [lastSymbol, setLastSymbol] = useState(symbol);
  if (lastSymbol !== symbol) {
    setLastSymbol(symbol);
    setSaved(initialSaved);
  }

  const toggle = useCallback(async () => {
    if (pending) return;
    setPending(true);
    const next = !saved;

    setSaved(next);

    try {
      const res = await fetch(
        next
          ? "/api/watchlist"
          : `/api/watchlist?symbol=${encodeURIComponent(symbol)}`,
        {
          method: next ? "POST" : "DELETE",
          ...(next
            ? {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ symbol }),
              }
            : {}),
        },
      );

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      // Revert on failure so the UI never claims a change that did not land.
      setSaved(!next);
    } finally {
      setPending(false);
    }
  }, [pending, saved, symbol]);

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={saved}
      title={saved ? `Hapus ${symbol} dari watchlist` : `Tambahkan ${symbol} ke watchlist`}
      aria-label={saved ? `Hapus ${symbol} dari watchlist` : `Tambahkan ${symbol} ke watchlist`}
      className={className}
    >
      <svg
        viewBox="0 0 24 24"
        className={`size-3.5 ${saved ? "fill-accent-500 text-accent-500" : ""}`}
        fill={saved ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1.1 5.8-5.3-2.8-5.3 2.8 1.1-5.8L3.5 9.7l5.9-.8z" />
      </svg>
    </button>
  );
}