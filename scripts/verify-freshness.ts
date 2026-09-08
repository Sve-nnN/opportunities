import assert from "node:assert/strict";

import { db } from "../src/db/client";
import { syncLog } from "../src/db/schema";
import {
  getLatestSyncPerSource,
  isSourceStale,
  KNOWN_SOURCES,
  type SyncLogRow,
} from "../src/db/queries/sync-log";

/**
 * Ad hoc regression check for 02-03 Task 1's freshness helpers, run directly
 * against live Postgres via `tsx` (same no-test-framework convention as
 * scripts/verify-filters.ts, 02-02-SUMMARY.md).
 *
 *   DATABASE_URL=postgresql://postgres:devpassword@127.0.0.1:5434/opportunities \
 *     pnpm exec tsx scripts/verify-freshness.ts
 *
 * `isSourceStale` is pure (no DB), so its 3 required behaviors are asserted
 * directly against constructed fixtures — this is the RED/GREEN cycle's
 * actual unit-level coverage. `getLatestSyncPerSource` is then cross-checked
 * against a direct query per source, against live data.
 */
function fixtureRow(overrides: Partial<SyncLogRow>): SyncLogRow {
  return {
    id: 0,
    source: "summer2027-internships",
    startedAt: new Date(),
    finishedAt: new Date(),
    success: true,
    rowsUpserted: 0,
    rowsSoftDeleted: 0,
    errorMessage: null,
    ...overrides,
  };
}

async function main() {
  const now = new Date("2026-09-07T22:00:00Z");

  // Behavior 1: null row (never synced) is stale.
  assert.equal(isSourceStale(null, now), true, "null row should be stale");

  // Behavior 2: success=false is stale, regardless of recency.
  const failedRecently = fixtureRow({
    success: false,
    finishedAt: new Date(now.getTime() - 5 * 60 * 1000), // 5 min ago
  });
  assert.equal(
    isSourceStale(failedRecently, now),
    true,
    "a row with success=false should be stale even if recent",
  );

  // Behavior 3: finished > 6h ago is stale, even if success=true.
  const oldSuccess = fixtureRow({
    success: true,
    finishedAt: new Date(now.getTime() - 7 * 60 * 60 * 1000), // 7h ago
  });
  assert.equal(
    isSourceStale(oldSuccess, now),
    true,
    "a row finished >6h ago should be stale even if success=true",
  );

  // Behavior 4 (the plan's explicit non-stale example): success=true, 45min
  // ago is NOT stale.
  const recentSuccess = fixtureRow({
    success: true,
    finishedAt: new Date(now.getTime() - 45 * 60 * 1000), // 45 min ago
  });
  assert.equal(
    isSourceStale(recentSuccess, now),
    false,
    "a row synced 45min ago with success=true should NOT be stale",
  );

  // Behavior 5: exactly at the 6h boundary is NOT stale (strictly greater-than).
  const atBoundary = fixtureRow({
    success: true,
    finishedAt: new Date(now.getTime() - 6 * 60 * 60 * 1000),
  });
  assert.equal(
    isSourceStale(atBoundary, now),
    false,
    "a row exactly 6h old should not be stale (threshold is exclusive)",
  );

  // getLatestSyncPerSource: cross-check against a direct query per source.
  const latest = await getLatestSyncPerSource(db);
  assert.deepEqual(
    Object.keys(latest).sort(),
    [...KNOWN_SOURCES].sort(),
    "getLatestSyncPerSource should return exactly the 3 known sources",
  );

  // Cross-check: every source with at least one sync_log row must resolve to
  // a non-null latest row here, and that row's startedAt must equal the max
  // startedAt among all of that source's rows.
  const allRows = await db.select().from(syncLog);
  for (const source of KNOWN_SOURCES) {
    const rowsForSource = allRows.filter((r) => r.source === source);
    if (rowsForSource.length === 0) continue;

    const maxStartedAt = rowsForSource.reduce(
      (max, r) => Math.max(max, new Date(r.startedAt).getTime()),
      0,
    );
    assert.ok(
      latest[source] !== null,
      `expected a non-null latest row for source="${source}" (has ${rowsForSource.length} rows)`,
    );
    assert.equal(
      new Date(latest[source]!.startedAt).getTime(),
      maxStartedAt,
      `getLatestSyncPerSource("${source}") did not return the row with the max startedAt`,
    );
  }

  console.log("All freshness behaviors verified.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Freshness verification FAILED:", error);
    process.exit(1);
  });
