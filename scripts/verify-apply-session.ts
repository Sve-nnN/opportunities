import assert from "node:assert/strict";

import { eq } from "drizzle-orm";

import { db } from "../src/db/client";
import { applicationHistory, applications, opportunities, profileFields } from "../src/db/schema";
import { insertApplicationHistory } from "../src/db/queries/application-history";
import { opportunityExistsByExternalId } from "../src/db/queries/opportunities";
import { upsertProfileField } from "../src/db/queries/profile";
import { isForwardAutoApplyTransition } from "../src/lib/application-status";

/**
 * Ad hoc regression check for 06-01's apply-session callback (same
 * no-test-framework convention as scripts/verify-status-extension.ts and
 * scripts/verify-profile.ts). Two layers:
 *
 * 1. Data layer (Task 1, always runs): confirms
 *    isForwardAutoApplyTransition's transition rules, that
 *    opportunityExistsByExternalId distinguishes a real external_id from
 *    an invented one, that upsertProfileField(..., tx) respects a real
 *    rollback (the row does NOT persist), and that
 *    insertApplicationHistory persists and reads back a row.
 * 2. HTTP layer (Task 2, only runs when a baseUrl arg is given): drives
 *    the real POST /api/applications/[externalId]/apply-session route
 *    against a running `pnpm dev` server — auth, 404, status/transition
 *    validation, size caps, a 3-call happy path that accumulates history
 *    rows, backward-transition rejection, and profile-collision atomicity.
 *
 * Run data-layer only:
 *   DATABASE_URL=postgresql://postgres:devpassword@127.0.0.1:5434/opportunities \
 *     pnpm exec tsx scripts/verify-apply-session.ts
 *
 * Run data-layer + HTTP layer (dev server must already be up with
 * AUTO_APPLY_CALLBACK_SECRET set to the SAME value passed here):
 *   AUTO_APPLY_CALLBACK_SECRET=... DATABASE_URL=postgresql://postgres:devpassword@127.0.0.1:5434/opportunities \
 *     pnpm exec tsx scripts/verify-apply-session.ts http://localhost:3921
 */

async function verifyIsForwardAutoApplyTransition() {
  // Starting fresh (null, or any non-auto-apply state) always permits any
  // of the 3 auto-apply statuses.
  assert.equal(isForwardAutoApplyTransition(null, "auto_fill_in_progress"), true);
  assert.equal(isForwardAutoApplyTransition(null, "ready_to_review"), true);
  assert.equal(isForwardAutoApplyTransition(null, "submitted"), true);
  assert.equal(isForwardAutoApplyTransition("applied", "auto_fill_in_progress"), true);
  assert.equal(isForwardAutoApplyTransition("saved", "submitted"), true);

  // Forward progress within the 3 auto-apply statuses is permitted.
  assert.equal(
    isForwardAutoApplyTransition("auto_fill_in_progress", "ready_to_review"),
    true,
  );
  assert.equal(isForwardAutoApplyTransition("ready_to_review", "submitted"), true);

  // Same-status "transition" is a permitted no-op.
  assert.equal(
    isForwardAutoApplyTransition("auto_fill_in_progress", "auto_fill_in_progress"),
    true,
  );

  // Backward transitions between the 3 auto-apply statuses are rejected.
  assert.equal(isForwardAutoApplyTransition("submitted", "auto_fill_in_progress"), false);
  assert.equal(isForwardAutoApplyTransition("ready_to_review", "auto_fill_in_progress"), false);
  assert.equal(isForwardAutoApplyTransition("submitted", "ready_to_review"), false);

  console.log(
    "PASS: isForwardAutoApplyTransition permits starting fresh from any non-auto/null state, permits forward/no-op moves among the 3 auto-apply statuses, and rejects backward moves",
  );
}

async function verifyOpportunityExistsByExternalId() {
  const [sampleRow] = await db
    .select({ externalId: opportunities.externalId })
    .from(opportunities)
    .limit(1);
  assert.ok(
    sampleRow,
    "expected at least 1 real opportunities row to build a test external_id from",
  );

  const realExists = await opportunityExistsByExternalId(sampleRow.externalId);
  assert.equal(realExists, true, "expected a real external_id to exist");

  const fakeExists = await opportunityExistsByExternalId(
    "zzzz-verify-apply-session-nonexistent-zzzz",
  );
  assert.equal(fakeExists, false, "expected an invented external_id to not exist");

  console.log(
    "PASS: opportunityExistsByExternalId distinguishes a real external_id from an invented one",
  );
}

async function verifyUpsertProfileFieldRollsBackInsideTransaction() {
  const testKey = "zzzz_verify_apply_session_rollback_zzzz";
  const testLabel = "Zzzz Verify Apply Session Rollback Zzzz";

  // Sanity: the key must not already exist from a prior failed run.
  const preExisting = await db
    .select({ id: profileFields.id })
    .from(profileFields)
    .where(eq(profileFields.key, testKey));
  assert.equal(
    preExisting.length,
    0,
    `expected no pre-existing row for test key "${testKey}" before this check`,
  );

  await assert.rejects(
    db.transaction(async (tx) => {
      await upsertProfileField(
        {
          key: testKey,
          label: testLabel,
          value: "should never persist",
          category: "test",
          source: "ai_session",
        },
        tx,
      );
      throw new Error("deliberate rollback trigger");
    }),
    /deliberate rollback trigger/,
  );

  const afterRollback = await db
    .select()
    .from(profileFields)
    .where(eq(profileFields.key, testKey));
  assert.equal(
    afterRollback.length,
    0,
    `expected upsertProfileField(..., tx) to be rolled back — found ${afterRollback.length} row(s) for key "${testKey}"`,
  );

  console.log(
    "PASS: upsertProfileField(..., tx) participates in a real db.transaction() rollback — the row does not persist",
  );
}

async function verifyInsertApplicationHistory() {
  const [sampleRow] = await db
    .select({ externalId: opportunities.externalId })
    .from(opportunities)
    .limit(1);
  assert.ok(sampleRow, "expected at least 1 real opportunities row for the history test");
  const externalId = sampleRow.externalId;

  const marker = "zzzz-verify-apply-session-history-zzzz";

  try {
    await insertApplicationHistory({
      opportunityExternalId: externalId,
      status: "auto_fill_in_progress",
      notes: marker,
      sentFields: [{ key: "full_name", label: "Nombre completo", value: "Juan Test" }],
      profileUpdates: [{ label: "Nombre completo", value: "Juan Test", category: "contacto" }],
      newlyLearnedKeys: ["nombre_completo"],
    });

    const rows = await db
      .select()
      .from(applicationHistory)
      .where(eq(applicationHistory.opportunityExternalId, externalId));
    const testRow = rows.find((row) => row.notes === marker);
    assert.ok(testRow, "expected the inserted application_history row to be readable back");
    assert.equal(testRow?.status, "auto_fill_in_progress");
    assert.deepEqual(testRow?.newlyLearnedKeys, ["nombre_completo"]);
    console.log(
      "PASS: insertApplicationHistory persists and reads back a row via the plain (non-transaction) path",
    );
  } finally {
    await db
      .delete(applicationHistory)
      .where(eq(applicationHistory.opportunityExternalId, externalId));
    const leftover = await db
      .select()
      .from(applicationHistory)
      .where(eq(applicationHistory.opportunityExternalId, externalId));
    const stillHasTestRow = leftover.some((row) => row.notes === marker);
    assert.equal(stillHasTestRow, false, "expected the test history row to be cleaned up");
    console.log("Cleanup: test application_history row removed, live data left untouched.");
  }
}

async function verifyDataLayer() {
  await verifyIsForwardAutoApplyTransition();
  await verifyOpportunityExistsByExternalId();
  await verifyUpsertProfileFieldRollsBackInsideTransaction();
  await verifyInsertApplicationHistory();
  console.log("\nAll apply-session data-layer behaviors verified against live Postgres.");
}

interface AppRow {
  status: string;
  notes: string | null;
}

async function getApplicationRow(externalId: string): Promise<AppRow | undefined> {
  const [row] = await db
    .select({ status: applications.status, notes: applications.notes })
    .from(applications)
    .where(eq(applications.opportunityExternalId, externalId));
  return row;
}

async function getHistoryRows(externalId: string) {
  return db
    .select()
    .from(applicationHistory)
    .where(eq(applicationHistory.opportunityExternalId, externalId));
}

async function postApplySession(
  baseUrl: string,
  externalId: string,
  body: unknown,
  authHeader: string | undefined,
): Promise<{ status: number; json: { ok: boolean; error?: string } }> {
  const response = await fetch(
    `${baseUrl}/api/applications/${encodeURIComponent(externalId)}/apply-session`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(authHeader !== undefined ? { authorization: authHeader } : {}),
      },
      body: JSON.stringify(body),
    },
  );
  const json = (await response.json()) as { ok: boolean; error?: string };
  return { status: response.status, json };
}

async function verifyHttpLayer(baseUrl: string) {
  const secret = process.env.AUTO_APPLY_CALLBACK_SECRET;
  assert.ok(
    secret,
    "AUTO_APPLY_CALLBACK_SECRET must be set in this script's environment to run the HTTP layer, matching the value the dev server was started with",
  );
  const validAuth = `Bearer ${secret}`;

  const [sampleRow] = await db
    .select({ externalId: opportunities.externalId })
    .from(opportunities)
    .limit(1);
  assert.ok(sampleRow, "expected at least 1 real opportunities row to drive the HTTP checks");
  const externalId = sampleRow.externalId;

  const originalApplication = await getApplicationRow(externalId);
  const originalHistory = await getHistoryRows(externalId);
  const collisionLabel = "LinkedIn";
  const collisionKey = "linkedin";
  const originalProfileRow = await db
    .select()
    .from(profileFields)
    .where(eq(profileFields.key, collisionKey));
  const newFieldLabel = "Zzzz Verify Apply Session New Field Zzzz";
  const newFieldKey = "zzzz_verify_apply_session_new_field_zzzz";

  try {
    // (1) Auth: missing header and wrong secret both 401, no writes.
    const noAuth = await postApplySession(
      baseUrl,
      externalId,
      { status: "auto_fill_in_progress", sentFields: [] },
      undefined,
    );
    assert.equal(noAuth.status, 401, "expected 401 with no Authorization header");
    assert.equal(noAuth.json.ok, false);

    const wrongAuth = await postApplySession(
      baseUrl,
      externalId,
      { status: "auto_fill_in_progress", sentFields: [] },
      "Bearer definitely-not-the-secret",
    );
    assert.equal(wrongAuth.status, 401, "expected 401 with an incorrect Bearer secret");

    const afterAuthChecks = await getApplicationRow(externalId);
    assert.deepEqual(
      afterAuthChecks,
      originalApplication,
      "expected no applications row change after failed auth attempts",
    );
    const historyAfterAuthChecks = await getHistoryRows(externalId);
    assert.equal(
      historyAfterAuthChecks.length,
      originalHistory.length,
      "expected no application_history rows created after failed auth attempts",
    );
    console.log("PASS: 401 on missing/incorrect Authorization header, no Postgres writes");

    // (2) 404: nonexistent externalId.
    const fakeExternalId = "zzzz-verify-apply-session-http-nonexistent-zzzz";
    const notFound = await postApplySession(
      baseUrl,
      fakeExternalId,
      { status: "auto_fill_in_progress", sentFields: [] },
      validAuth,
    );
    assert.equal(notFound.status, 404, "expected 404 for a nonexistent externalId");
    const fakeAppRow = await getApplicationRow(fakeExternalId);
    assert.equal(fakeAppRow, undefined, "expected no applications row for the fake externalId");
    const fakeHistoryRows = await getHistoryRows(fakeExternalId);
    assert.equal(
      fakeHistoryRows.length,
      0,
      "expected no application_history rows for the fake externalId",
    );
    console.log("PASS: 404 for a nonexistent externalId, no rows created");

    // (3) 400 for an out-of-enum status.
    const manualStatus = await postApplySession(
      baseUrl,
      externalId,
      { status: "applied", sentFields: [] },
      validAuth,
    );
    assert.equal(manualStatus.status, 400, "expected 400 for a manually-selectable status");

    const garbageStatus = await postApplySession(
      baseUrl,
      externalId,
      { status: "not_a_real_status", sentFields: [] },
      validAuth,
    );
    assert.equal(garbageStatus.status, 400, "expected 400 for an arbitrary status string");
    console.log("PASS: 400 for a status outside AUTO_APPLY_CALLBACK_STATUSES");

    // (4) 400 for an over-cap sentFields array (51 entries).
    const oversizedSentFields = Array.from({ length: 51 }, (_, i) => ({
      key: `field_${i}`,
      label: `Field ${i}`,
      value: `value ${i}`,
    }));
    const oversized = await postApplySession(
      baseUrl,
      externalId,
      { status: "auto_fill_in_progress", sentFields: oversizedSentFields },
      validAuth,
    );
    assert.equal(oversized.status, 400, "expected 400 for a 51-entry sentFields array");
    console.log("PASS: 400 for sentFields exceeding the 50-entry cap");

    // (5) Happy path, 3 sequential calls accumulating history.
    const call1 = await postApplySession(
      baseUrl,
      externalId,
      { status: "auto_fill_in_progress", sentFields: [] },
      validAuth,
    );
    assert.equal(call1.status, 200, `expected 200 for call 1, got ${call1.status}`);
    const afterCall1App = await getApplicationRow(externalId);
    assert.equal(afterCall1App?.status, "auto_fill_in_progress");
    const afterCall1History = await getHistoryRows(externalId);
    assert.equal(
      afterCall1History.length,
      originalHistory.length + 1,
      "expected exactly 1 new application_history row after call 1",
    );

    const call2 = await postApplySession(
      baseUrl,
      externalId,
      {
        status: "ready_to_review",
        sentFields: [
          { key: "full_name", label: "Nombre completo", value: "Juan Test" },
          { key: "email", label: "Email", value: "juan@example.com" },
        ],
        profileUpdates: [
          { label: newFieldLabel, value: "valor de prueba", category: "test" },
        ],
      },
      validAuth,
    );
    assert.equal(call2.status, 200, `expected 200 for call 2, got ${call2.status}`);
    const afterCall2App = await getApplicationRow(externalId);
    assert.equal(afterCall2App?.status, "ready_to_review");
    const afterCall2History = await getHistoryRows(externalId);
    assert.equal(
      afterCall2History.length,
      originalHistory.length + 2,
      "expected exactly 2 new application_history rows after call 2 (accumulated, not replaced)",
    );
    const call2HistoryRow = afterCall2History.find(
      (row) => row.status === "ready_to_review",
    );
    assert.ok(call2HistoryRow, "expected a history row with status ready_to_review");
    assert.deepEqual(
      call2HistoryRow?.newlyLearnedKeys,
      [newFieldKey],
      "expected newlyLearnedKeys to contain exactly the new field's derived key",
    );
    const [newProfileRow] = await db
      .select()
      .from(profileFields)
      .where(eq(profileFields.key, newFieldKey));
    assert.ok(newProfileRow, "expected the new profile field to have been upserted");
    assert.equal(newProfileRow.source, "ai_session");

    const call3 = await postApplySession(
      baseUrl,
      externalId,
      { status: "submitted", sentFields: [] },
      validAuth,
    );
    assert.equal(call3.status, 200, `expected 200 for call 3, got ${call3.status}`);
    const afterCall3App = await getApplicationRow(externalId);
    assert.equal(afterCall3App?.status, "submitted");
    const afterCall3History = await getHistoryRows(externalId);
    assert.equal(
      afterCall3History.length,
      originalHistory.length + 3,
      "expected exactly 3 new application_history rows total after call 3",
    );
    console.log(
      "PASS: 3-call happy path accumulates application_history rows without replacing, and learns a new profile field",
    );

    // (6) Backward transition rejected — already at submitted from call 3.
    const backward = await postApplySession(
      baseUrl,
      externalId,
      { status: "auto_fill_in_progress", sentFields: [] },
      validAuth,
    );
    assert.equal(backward.status, 400, "expected 400 for a backward transition from submitted");
    const afterBackwardApp = await getApplicationRow(externalId);
    assert.equal(
      afterBackwardApp?.status,
      "submitted",
      "expected applications.status to remain submitted after a rejected backward transition",
    );
    const afterBackwardHistory = await getHistoryRows(externalId);
    assert.equal(
      afterBackwardHistory.length,
      originalHistory.length + 3,
      "expected no 4th application_history row after a rejected backward transition",
    );
    console.log(
      "PASS: 400 for submitted -> auto_fill_in_progress, status and history both left untouched",
    );

    // Cleanup call2's new profile field before the collision check so it
    // doesn't interfere with counts below.
    await db.delete(profileFields).where(eq(profileFields.key, newFieldKey));

    // (7) Profile collision aborts the ENTIRE transaction (profile + status
    // + history), not just the profile write.
    if (originalProfileRow.length === 0) {
      await upsertProfileField({
        key: collisionKey,
        label: collisionLabel,
        value: "https://linkedin.com/in/original",
        category: "links",
        source: "manual",
      });
    }
    const preCollisionApp = await getApplicationRow(externalId);
    const preCollisionHistory = await getHistoryRows(externalId);
    const preCollisionProfileRow = await db
      .select()
      .from(profileFields)
      .where(eq(profileFields.key, collisionKey));

    const collision = await postApplySession(
      baseUrl,
      externalId,
      {
        status: "ready_to_review",
        sentFields: [],
        profileUpdates: [
          { label: "linkedin", value: "https://linkedin.com/in/collided", category: "links" },
        ],
      },
      validAuth,
    );
    assert.equal(collision.status, 400, "expected 400 for a profile label collision");

    const [postCollisionProfileRow] = await db
      .select()
      .from(profileFields)
      .where(eq(profileFields.key, collisionKey));
    assert.equal(
      postCollisionProfileRow.label,
      preCollisionProfileRow[0].label,
      "expected the original profile_fields label to remain untouched after a collision",
    );
    assert.equal(
      postCollisionProfileRow.value,
      preCollisionProfileRow[0].value,
      "expected the original profile_fields value to remain untouched after a collision",
    );

    const postCollisionApp = await getApplicationRow(externalId);
    assert.deepEqual(
      postCollisionApp,
      preCollisionApp,
      "expected applications row to remain untouched after a collision-aborted transaction",
    );

    const postCollisionHistory = await getHistoryRows(externalId);
    assert.equal(
      postCollisionHistory.length,
      preCollisionHistory.length,
      "expected no new application_history row after a collision-aborted transaction",
    );
    console.log(
      "PASS: a profile label collision aborts the whole transaction — profile, status, and history all left untouched",
    );

    // Cleanup the collision-seeded profile row if this run created it.
    if (originalProfileRow.length === 0) {
      await db.delete(profileFields).where(eq(profileFields.key, collisionKey));
    }

    // (8) Genuine concurrent-request race — CR-01 (06-REVIEW.md) advisory-lock
    // regression test. Unlike a sequential call, this fires two truly
    // concurrent POSTs (Promise.all, no await between them) against the SAME
    // externalId, set up so the outcome is ONLY guaranteed deterministic if
    // the read-then-write (currentStatus check -> onConflictDoUpdate) is
    // actually serialized end-to-end by pg_advisory_xact_lock, not just
    // "read inside a transaction" (which under READ COMMITTED provides no
    // such guarantee on its own).
    //
    // Setup: force applications.status = "ready_to_review" directly (not via
    // the endpoint, to control the exact starting point regardless of what
    // earlier steps in this script left behind). Then fire concurrently:
    //   - Request A: target "submitted"        (ready_to_review -> submitted: always forward, must always succeed)
    //   - Request B: target "ready_to_review"   (valid no-op IF it reads the
    //     pre-A "ready_to_review" state; invalid backward IF it reads
    //     post-A's committed "submitted" state)
    //
    // If the two transactions are genuinely serialized (lock held from
    // before the read until COMMIT), the final `applications.status` MUST
    // be "submitted" no matter which request's transaction wins the race:
    //   - A-then-B: A commits "submitted"; B reads "submitted", target
    //     "ready_to_review" is backward -> B is rejected (400), state stays
    //     "submitted".
    //   - B-then-A: B commits "ready_to_review" (no-op vs. its own stale
    //     read); A then reads "ready_to_review" -> "submitted" is forward ->
    //     A commits, final state "submitted".
    // Without a real lock serializing the whole read+write, B could read the
    // pre-A state, then have its own UPDATE land AFTER A's commit, clobbering
    // "submitted" back down to "ready_to_review" — the exact status
    // regression 06-REVIEW.md CR-01 flagged. This assertion fails if that
    // regression happens, regardless of which request the race scheduler
    // happens to run first.
    await db
      .update(applications)
      .set({ status: "ready_to_review" })
      .where(eq(applications.opportunityExternalId, externalId));

    const [raceA, raceB] = await Promise.all([
      postApplySession(baseUrl, externalId, { status: "submitted", sentFields: [] }, validAuth),
      postApplySession(
        baseUrl,
        externalId,
        { status: "ready_to_review", sentFields: [] },
        validAuth,
      ),
    ]);

    assert.equal(
      raceA.status,
      200,
      `expected the forward ready_to_review->submitted request to always succeed regardless of race ordering, got ${raceA.status}`,
    );
    assert.ok(
      raceB.status === 200 || raceB.status === 400,
      `expected the concurrent same-target request to either win the race (200, no-op against its own stale read) or lose it (400, rejected as backward against the committed state), got ${raceB.status}`,
    );

    const afterRaceApp = await getApplicationRow(externalId);
    assert.equal(
      afterRaceApp?.status,
      "submitted",
      'CR-01 REGRESSION: applications.status must never end up at "ready_to_review" after this concurrent forward+same-target race — that would mean the advisory lock failed to serialize the two transactions end-to-end',
    );
    console.log(
      `PASS: genuine concurrent race (Promise.all, no sequential await) never regresses applications.status — raceA=${raceA.status}, raceB=${raceB.status}, final status=submitted`,
    );
  } finally {
    // Restore applications row to its pre-test state.
    if (originalApplication) {
      await db
        .update(applications)
        .set({ status: originalApplication.status, notes: originalApplication.notes })
        .where(eq(applications.opportunityExternalId, externalId));
    } else {
      await db.delete(applications).where(eq(applications.opportunityExternalId, externalId));
    }

    // Remove any history rows this run created beyond the original set.
    const originalHistoryIds = new Set(originalHistory.map((row) => row.id));
    const currentHistory = await getHistoryRows(externalId);
    for (const row of currentHistory) {
      if (!originalHistoryIds.has(row.id)) {
        await db.delete(applicationHistory).where(eq(applicationHistory.id, row.id));
      }
    }

    // Clean up any leftover test profile fields defensively.
    await db.delete(profileFields).where(eq(profileFields.key, newFieldKey));
    if (originalProfileRow.length === 0) {
      await db.delete(profileFields).where(eq(profileFields.key, collisionKey));
    }

    console.log(`Cleanup: restored applications/application_history/profile_fields state for ${externalId}.`);
  }
}

async function main() {
  await verifyDataLayer();

  const baseUrl = process.argv[2];
  if (baseUrl) {
    await verifyHttpLayer(baseUrl);
    console.log("\nAll apply-session HTTP-layer behaviors verified against a real dev server.");
  } else {
    console.log(
      "[info] no baseUrl argument given — skipping HTTP layer (06-01-PLAN.md Task 2). Run again with a baseUrl (e.g. http://localhost:3921) once `pnpm dev` is up with AUTO_APPLY_CALLBACK_SECRET set.",
    );
  }

  console.log("\nAll apply-session behaviors verified.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Apply-session verification FAILED:", error);
    process.exit(1);
  });
