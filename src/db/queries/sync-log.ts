import { desc, eq, inArray } from "drizzle-orm";

import type { Database } from "../client";
import { syncLog } from "../schema";

/**
 * The 3 sources this app ever ingests (Phase 1's `runSync()`, `src/ingestion/sync.ts`).
 * Freshness badges/banners (DISC-04) are scoped to exactly these — a row for
 * an unrecognized `source` value would be a Phase 1 ingestion bug, not
 * something the dashboard should silently render freshness for.
 */
export const KNOWN_SOURCES = [
  "summer2027-internships",
  "underclassmen-opportunities",
  "student-benefits",
] as const;
export type KnownSource = (typeof KNOWN_SOURCES)[number];

export type SyncLogRow = typeof syncLog.$inferSelect;

/** How stale a source's last successful/attempted sync must be before it's flagged. */
export const STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000;

export async function startSyncLog(
  db: Database,
  source: string,
): Promise<number> {
  const [row] = await db
    .insert(syncLog)
    .values({
      source,
      startedAt: new Date(),
      // success stays null while the sync is running.
    })
    .returning({ id: syncLog.id });

  return row.id;
}

export interface FinishSyncLogInput {
  success: boolean;
  rowsUpserted: number;
  rowsSoftDeleted: number;
  errorMessage?: string;
}

export async function finishSyncLog(
  db: Database,
  id: number,
  input: FinishSyncLogInput,
): Promise<void> {
  await db
    .update(syncLog)
    .set({
      finishedAt: new Date(),
      success: input.success,
      rowsUpserted: input.rowsUpserted,
      rowsSoftDeleted: input.rowsSoftDeleted,
      errorMessage: input.errorMessage,
    })
    .where(eq(syncLog.id, id));
}

/**
 * For each of the 3 known sources, the most recent `sync_log` row by
 * `startedAt` — regardless of success, so a currently-running or just-failed
 * sync is still "the latest" (DISC-04's stale-sync-banner needs to see
 * failures, not just the latest success). `null` for a source that has never
 * synced (e.g. a fresh dev DB before the first `runSync()`).
 *
 * `selectDistinctOn` is Postgres-specific (`DISTINCT ON`) but matches the
 * single-Postgres deploy target (STACK.md) and avoids a 3-round-trip
 * per-source query. Uses Drizzle's typed query builder (not raw `sql`) so
 * the returned rows keep the schema's camelCase field mapping
 * (`finishedAt`, not `finished_at`) rather than raw Postgres column names.
 */
export async function getLatestSyncPerSource(
  db: Database,
): Promise<Record<KnownSource, SyncLogRow | null>> {
  const rows = await db
    .selectDistinctOn([syncLog.source])
    .from(syncLog)
    .where(inArray(syncLog.source, KNOWN_SOURCES))
    .orderBy(syncLog.source, desc(syncLog.startedAt));

  const bySource = new Map<string, SyncLogRow>();
  for (const row of rows) {
    bySource.set(row.source, row);
  }

  return Object.fromEntries(
    KNOWN_SOURCES.map((source) => [source, bySource.get(source) ?? null]),
  ) as Record<KnownSource, SyncLogRow | null>;
}

/**
 * Pure, DB-free helper (RED/GREEN-testable via scripts/verify-freshness.ts):
 * a source is "stale" if it has never synced, its latest attempt failed, or
 * its latest attempt finished more than `STALE_THRESHOLD_MS` (6h) ago.
 *
 * A row still `finishedAt: null` (sync in progress) is treated as stale too
 * — it has no successful, recent completion to report freshness for, and
 * `now - null` would otherwise throw/NaN rather than fail safe.
 */
export function isSourceStale(
  latestRow: SyncLogRow | null,
  now: Date,
): boolean {
  if (!latestRow) return true;
  if (latestRow.success === false) return true;
  if (!latestRow.finishedAt) return true;

  const ageMs = now.getTime() - new Date(latestRow.finishedAt).getTime();
  return ageMs > STALE_THRESHOLD_MS;
}
