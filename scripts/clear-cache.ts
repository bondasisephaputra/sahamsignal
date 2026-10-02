/**
 * Dev utility: drop cached upstream payloads.
 *
 * The cache is keyed by request shape, not by code version, so after changing
 * how a response is parsed the stored rows still hold the old interpretation.
 * Run this to force a refetch: `node -e "..."` or `npm run cache:clear`.
 */
import { createClient } from "@libsql/client";

const url = process.env.DATABASE_URL?.trim() || "file:./data/saham.db";
const db = createClient({
  url,
  authToken: process.env.DATABASE_AUTH_TOKEN?.trim() || undefined,
});

const cache = await db.execute("DELETE FROM data_cache");
const stale = await db.execute("DELETE FROM signal_history");
db.close();

console.log(`cache:cleared rows=${cache.rowsAffected} signals=${stale.rowsAffected}`);