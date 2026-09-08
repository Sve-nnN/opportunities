import assert from "node:assert/strict";

import { eq } from "drizzle-orm";

import { db } from "../src/db/client";
import { applications, opportunities } from "../src/db/schema";
import {
  getApplicationsByExternalIds,
  upsertApplicationStatus,
} from "../src/db/queries/applications";
import { APPLICATION_STATUSES } from "../src/lib/application-status";

/**
 * Ad hoc regression check for 03-01's applications queries, run directly
 * against live Postgres via `tsx` (same convention as Phase 2's
 * verify-filters.ts/verify-freshness.ts — no test framework in this
 * project's stack). Run manually:
 *
 *   DATABASE_URL=postgresql://postgres:devpassword@127.0.0.1:5434/opportunities \
 *     pnpm exec tsx scripts/verify-applications.ts
 *
 * Uses 3 real `external_id`s pulled live from `opportunities` (never
 * hardcoded), upserts through the same 6-state sequence on each, then
 * deletes the test rows it created so a real run leaves no residue behind
 * (no test-transaction framework in this stack — manual rollback).
 */
async function main() {
  const sampleRows = await db
    .select({ externalId: opportunities.externalId })
    .from(opportunities)
    .limit(3);
  assert.equal(
    sampleRows.length,
    3,
    "expected at least 3 real opportunities rows to build test external_ids from",
  );
  const externalIds = sampleRows.map((row) => row.externalId);

  // Track which of the 3 external_ids had a PRE-EXISTING applications row,
  // since this script runs against live dev data (which could already have
  // tracked applications from manual UI testing) — only rows this script
  // itself creates get deleted at the end; a pre-existing row is left as-is.
  const preExisting = new Map<string, boolean>();
  for (const externalId of externalIds) {
    const [existing] = await db
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.opportunityExternalId, externalId));
    preExisting.set(externalId, Boolean(existing));
  }

  try {
    // Behavior 1: upsert-no-duplicate. Write all 6 valid statuses in
    // sequence onto the SAME external_id — must end with exactly 1 row per
    // external_id, not 6 (i.e. onConflictDoUpdate is really updating, not
    // inserting a new row each time).
    for (const externalId of externalIds) {
      for (const status of APPLICATION_STATUSES) {
        await upsertApplicationStatus(externalId, status);
      }
    }

    for (const externalId of externalIds) {
      const rows = await db
        .select({ id: applications.id })
        .from(applications)
        .where(eq(applications.opportunityExternalId, externalId));
      assert.equal(
        rows.length,
        1,
        `expected exactly 1 applications row for ${externalId} after 6 sequential upserts, found ${rows.length}`,
      );
    }
    console.log(
      "PASS: upsert-no-duplicate (1 row per external_id after 6 writes each)",
    );

    // Behavior 2: getApplicationsByExternalIds returns the LAST status
    // written for each of the 3 test external_ids, in one Map, one query.
    const lastStatus = APPLICATION_STATUSES[APPLICATION_STATUSES.length - 1];
    const resultMap = await getApplicationsByExternalIds(externalIds);
    for (const externalId of externalIds) {
      const record = resultMap.get(externalId);
      assert.ok(record, `expected a map entry for ${externalId}`);
      assert.equal(
        record.status,
        lastStatus,
        `expected ${externalId} to read back status="${lastStatus}" (the last write), got "${record.status}"`,
      );
    }
    console.log(
      `PASS: getApplicationsByExternalIds returns the last-written status ("${lastStatus}") for all 3 test external_ids in one Map`,
    );

    // Behavior 3: an external_id never tracked is simply absent from the
    // Map (never present with `null`/undefined status) — callers default it
    // to "not_applied" themselves (page.tsx), confirming the "never null"
    // must-have holds at the query layer, not just in the UI.
    const untracked = await getApplicationsByExternalIds([
      "zzzz-no-such-external-id-should-ever-exist-zzzz",
    ]);
    assert.equal(
      untracked.size,
      0,
      "expected a never-tracked external_id to be absent from the Map, not present with a null status",
    );
    console.log(
      "PASS: an untracked external_id is absent from the Map (page.tsx defaults it to not_applied)",
    );
  } finally {
    // Clean up: delete only the rows THIS script created; leave any
    // pre-existing row (from real manual UI testing) untouched.
    for (const externalId of externalIds) {
      if (!preExisting.get(externalId)) {
        await db
          .delete(applications)
          .where(eq(applications.opportunityExternalId, externalId));
      }
    }
    const leftover = await getApplicationsByExternalIds(externalIds);
    const stillPresent = externalIds.filter(
      (id) => leftover.has(id) && !preExisting.get(id),
    );
    assert.equal(
      stillPresent.length,
      0,
      `expected test rows to be deleted, but ${stillPresent.join(", ")} still present`,
    );
    console.log("Cleanup: test rows removed, live data left untouched.");
  }

  console.log("All applications behaviors verified against live Postgres.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Applications verification FAILED:", error);
    process.exit(1);
  });
