import { db } from "../db/client";
import { finishSyncLog, startSyncLog } from "../db/queries/sync-log";
import { upsertBenefits, upsertOpportunities } from "../db/queries/upsert";
import {
  normalizeBenefit,
  normalizeInternship,
  normalizeUnderclassmenRow,
} from "./normalize";
import { fetchStudentBenefits } from "./sources/student-benefits";
import { fetchSummerInternships } from "./sources/summer-internships";
import { fetchUnderclassmenOpportunities } from "./sources/underclassmen";

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
 * All 3 sources run in parallel via Promise.allSettled (research/PITFALLS.md
 * Performance Traps: run in parallel with per-source error isolation) — each
 * source is already internally try/caught in its own sync*() function below,
 * so allSettled here is a second layer of isolation guaranteeing that even
 * an unexpected throw escaping one source's try/catch can never prevent the
 * other sources' results from being collected.
 */
export async function runSync(): Promise<RunSyncResult> {
  const outcomes = await Promise.allSettled([
    syncStudentBenefits(),
    syncSummerInternships(),
    syncUnderclassmenOpportunities(),
  ]);

  const sourceNames = [
    "student-benefits",
    "summer2027-internships",
    "underclassmen-opportunities",
  ];

  const results: SyncSourceResult[] = outcomes.map((outcome, index) => {
    if (outcome.status === "fulfilled") {
      return outcome.value;
    }
    // Should be unreachable in practice — each sync*() function below
    // already catches its own errors — but if something throws before
    // reaching that catch (e.g. a startSyncLog() connection failure), still
    // report the failure per-source instead of losing the other two results.
    const errorMessage =
      outcome.reason instanceof Error ? outcome.reason.message : "Unknown sync error";
    return {
      source: sourceNames[index],
      success: false,
      rowsUpserted: 0,
      rowsSoftDeleted: 0,
      rowsSkipped: 0,
      errorMessage,
    };
  });

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

async function syncSummerInternships(): Promise<SyncSourceResult> {
  const source = "summer2027-internships";
  const syncLogId = await startSyncLog(db, source);

  try {
    const { rows: rawRows, skipped } = await fetchSummerInternships();
    const normalizedRows = rawRows.map(normalizeInternship);

    const { rowsUpserted, rowsSoftDeleted } = await upsertOpportunities(
      db,
      normalizedRows,
      source,
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

async function syncUnderclassmenOpportunities(): Promise<SyncSourceResult> {
  const source = "underclassmen-opportunities";
  const syncLogId = await startSyncLog(db, source);

  try {
    const { rows: rawRows, skipped } = await fetchUnderclassmenOpportunities();
    const normalizedRows = rawRows.map(normalizeUnderclassmenRow);

    const { rowsUpserted, rowsSoftDeleted } = await upsertOpportunities(
      db,
      normalizedRows,
      source,
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
