import assert from "node:assert/strict";

import { eq } from "drizzle-orm";

import { db } from "../src/db/client";
import { applications, opportunities } from "../src/db/schema";
import {
  getApplicationsByExternalIds,
  upsertApplicationNotes,
  upsertApplicationStatus,
} from "../src/db/queries/applications";

/**
 * Ad hoc regression check for 03-02 Task 2's notes upsert, run directly
 * against live Postgres via `tsx` (same convention as
 * scripts/verify-applications.ts — no test framework in this project's
 * stack). Run manually:
 *
 *   DATABASE_URL=postgresql://postgres:devpassword@127.0.0.1:5434/opportunities \
 *     pnpm exec tsx scripts/verify-notes.ts
 *
 * Uses 2 real `external_id`s pulled live from `opportunities` (never
 * hardcoded), exercises upsertApplicationNotes, then deletes/restores rows
 * it touched so a real run leaves no residue behind (no test-transaction
 * framework in this stack — manual rollback, same as verify-applications.ts).
 */
async function main() {
  const sampleRows = await db
    .select({ externalId: opportunities.externalId })
    .from(opportunities)
    .limit(2);
  assert.equal(
    sampleRows.length,
    2,
    "expected at least 2 real opportunities rows to build test external_ids from",
  );
  const [freshId, statusedId] = sampleRows.map((row) => row.externalId);

  const preExisting = new Map<string, boolean>();
  for (const externalId of [freshId, statusedId]) {
    const [existing] = await db
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.opportunityExternalId, externalId));
    preExisting.set(externalId, Boolean(existing));
  }

  // If either sampled external_id already had a row (real dev data from
  // manual UI testing), skip this run rather than corrupt/mutate real
  // tracked state — assert instead that we picked genuinely untracked ids
  // so the "creates a row with default status" behavior is really exercised.
  assert.ok(
    !preExisting.get(freshId) && !preExisting.get(statusedId),
    "expected both sampled external_ids to be untracked before this test runs; re-run to sample different rows",
  );

  try {
    // Behavior 1: upsertApplicationNotes on an external_id with NO prior
    // applications row creates a row with notes=text and status defaulting
    // to "not_applied" (the column default), never overwriting a status
    // that doesn't exist yet with anything other than the default.
    await upsertApplicationNotes(freshId, "primera nota de prueba");
    const [freshRow] = await db
      .select({
        notes: applications.notes,
        status: applications.status,
      })
      .from(applications)
      .where(eq(applications.opportunityExternalId, freshId));
    assert.ok(freshRow, `expected a new applications row for ${freshId}`);
    assert.equal(freshRow.notes, "primera nota de prueba");
    assert.equal(
      freshRow.status,
      "not_applied",
      "a brand-new notes-only row should default to not_applied, not null/undefined",
    );
    console.log(
      "PASS: upsertApplicationNotes on an untracked external_id creates a row with notes set and status defaulted to not_applied",
    );

    // Behavior 1b: upsertApplicationNotes must NOT overwrite an existing,
    // different status when the row already existed for another reason.
    await upsertApplicationStatus(statusedId, "in_progress");
    await upsertApplicationNotes(statusedId, "nota sobre postulación en curso");
    const [statusedRow] = await db
      .select({
        notes: applications.notes,
        status: applications.status,
      })
      .from(applications)
      .where(eq(applications.opportunityExternalId, statusedId));
    assert.ok(statusedRow, `expected an applications row for ${statusedId}`);
    assert.equal(statusedRow.notes, "nota sobre postulación en curso");
    assert.equal(
      statusedRow.status,
      "in_progress",
      "upsertApplicationNotes must never overwrite a pre-existing different status",
    );
    console.log(
      "PASS: upsertApplicationNotes never overwrites a pre-existing different status",
    );

    // Behavior 2: calling upsertApplicationNotes twice in a row on the same
    // external_id updates the same row (onConflictDoUpdate), never creates
    // a second row.
    await upsertApplicationNotes(freshId, "segunda nota, sobrescribiendo");
    await upsertApplicationNotes(freshId, "tercera nota, sobrescribiendo otra vez");
    const rows = await db
      .select({ id: applications.id, notes: applications.notes })
      .from(applications)
      .where(eq(applications.opportunityExternalId, freshId));
    assert.equal(
      rows.length,
      1,
      `expected exactly 1 applications row for ${freshId} after 3 sequential notes writes, found ${rows.length}`,
    );
    assert.equal(rows[0].notes, "tercera nota, sobrescribiendo otra vez");
    console.log(
      "PASS: repeated upsertApplicationNotes updates the same row, never duplicates",
    );

    // Behavior 3: getApplicationsByExternalIds exposes `notes` in the Map,
    // not just `status`/`isSaved`.
    const resultMap = await getApplicationsByExternalIds([freshId, statusedId]);
    const freshRecord = resultMap.get(freshId);
    const statusedRecord = resultMap.get(statusedId);
    assert.ok(freshRecord, `expected a map entry for ${freshId}`);
    assert.ok(statusedRecord, `expected a map entry for ${statusedId}`);
    assert.equal(freshRecord.notes, "tercera nota, sobrescribiendo otra vez");
    assert.equal(statusedRecord.notes, "nota sobre postulación en curso");
    console.log(
      "PASS: getApplicationsByExternalIds includes the notes field in its returned Map",
    );
  } finally {
    for (const externalId of [freshId, statusedId]) {
      if (!preExisting.get(externalId)) {
        await db
          .delete(applications)
          .where(eq(applications.opportunityExternalId, externalId));
      }
    }
    const leftover = await getApplicationsByExternalIds([freshId, statusedId]);
    assert.equal(
      leftover.size,
      0,
      "expected test rows to be deleted after cleanup",
    );
    console.log("Cleanup: test rows removed, live data left untouched.");
  }

  console.log("All notes behaviors verified against live Postgres.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Notes verification FAILED:", error);
    process.exit(1);
  });
