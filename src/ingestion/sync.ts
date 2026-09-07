import { db } from "../db/client";
import { finishSyncLog, startSyncLog } from "../db/queries/sync-log";
import { upsertBenefits } from "../db/queries/upsert";
import { normalizeBenefit } from "./normalize";
import { fetchStudentBenefits } from "./sources/student-benefits";

export interface SyncSourceResult {
  source: string;
  success: boolean;
  rowsUpserted: number;
  rowsSoftDeleted: number;
  rowsSkipped: number;
  errorMessage?: string;
}

export interface RunSyncResult {
  results: SyncSourceResult[];
}

/**
 * Orchestrates fetch -> parse -> normalize -> upsert -> sync_log for every
 * ingestion source, callable identically by the cron job
 * (jobs/scheduled-sync.ts) and the manual HTTP trigger (app/api/sync/route.ts)
 * — see research/ARCHITECTURE.md "jobs (cron) <-> ingestion" boundary.
 *
 * Phase 1 wires only `student-benefits` end-to-end (the tracer slice); Plan 2
 * extends this loop with the two markdown-table sources. Each source is
 * isolated in its own try/catch so one failing source's sync_log records
 * failure without ever throwing out of runSync() and crashing the whole
 * process — this shape is intentional groundwork for the multi-source loop.
 */
export async function runSync(): Promise<RunSyncResult> {
  const results: SyncSourceResult[] = [];

  results.push(await syncStudentBenefits());

  return { results };
}

async function syncStudentBenefits(): Promise<SyncSourceResult> {
  const source = "student-benefits";
  const syncLogId = await startSyncLog(db, source);

  try {
    const { rows: rawRows, skipped } = await fetchStudentBenefits();
    const normalizedRows = rawRows.map(normalizeBenefit);

    const { rowsUpserted, rowsSoftDeleted } = await upsertBenefits(
      db,
      normalizedRows,
    );

    await finishSyncLog(db, syncLogId, {
      success: true,
      rowsUpserted,
      rowsSoftDeleted,
    });

    return {
      source,
      success: true,
      rowsUpserted,
      rowsSoftDeleted,
      rowsSkipped: skipped,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown sync error";

    // Never crash the whole sync process on one source's failure — record
    // the failure in sync_log so it is always traceable (threat T-01-05 /
    // research/PITFALLS.md Pitfall 3 "silent data loss").
    await finishSyncLog(db, syncLogId, {
      success: false,
      rowsUpserted: 0,
      rowsSoftDeleted: 0,
      errorMessage,
    });

    return {
      source,
      success: false,
      rowsUpserted: 0,
      rowsSoftDeleted: 0,
      rowsSkipped: 0,
      errorMessage,
    };
  }
}
