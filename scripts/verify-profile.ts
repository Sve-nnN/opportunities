import assert from "node:assert/strict";

import { eq } from "drizzle-orm";

import { db } from "../src/db/client";
import { profileFields } from "../src/db/schema";
import {
  getAllProfileFields,
  updateProfileFieldValue,
  upsertProfileField,
} from "../src/db/queries/profile";
import { normalizeToKey } from "../src/lib/profile-key";

/**
 * Ad hoc regression check for 05-01's profile queries/normalization, run
 * directly against live Postgres via `tsx` (same convention as Phase 2/3's
 * verify-*.ts scripts — no test framework in this project's stack). Run
 * manually:
 *
 *   DATABASE_URL=postgresql://postgres:devpassword@127.0.0.1:5434/opportunities \
 *     pnpm exec tsx scripts/verify-profile.ts
 *
 * Creates its own test rows (never reads live `opportunities`/`applications`
 * data, unlike verify-applications.ts) and deletes them at the end — no
 * test-transaction framework in this stack, manual rollback.
 */
async function main() {
  // Behavior 0 (Task 1): normalizeToKey produces snake_case, no accents,
  // no spaces/slashes, no leading/trailing/duplicated underscores.
  assert.equal(
    normalizeToKey("Teléfono"),
    "telefono",
    "expected 'Teléfono' to normalize to 'telefono' (accent stripped)",
  );
  assert.equal(
    normalizeToKey("Link CV/resume"),
    "link_cv_resume",
    "expected 'Link CV/resume' to normalize to 'link_cv_resume' (no spaces/slashes/duplicated underscores)",
  );
  assert.equal(
    normalizeToKey("  Nombre completo  "),
    "nombre_completo",
    "expected leading/trailing whitespace to normalize away, not become leading/trailing underscores",
  );
  console.log(
    "PASS: normalizeToKey produces snake_case, accent-free, no leading/trailing/duplicated underscores",
  );

  // Behavior 1 (Task 1): upsertProfileField upserts by `key` — writing the
  // SAME derived key twice with different values must end with exactly 1
  // row, holding the SECOND value (last write wins, no versioning).
  const testKey = "zzzz_verify_profile_test_field_zzzz";
  const testLabel = "Zzzz Verify Profile Test Field Zzzz";

  try {
    await upsertProfileField({
      key: testKey,
      label: testLabel,
      value: "first value",
      category: "contacto",
      source: "manual",
    });
    await upsertProfileField({
      key: testKey,
      label: testLabel,
      value: "second value",
      category: "contacto",
      source: "manual",
    });

    const rows = await db
      .select()
      .from(profileFields)
      .where(eq(profileFields.key, testKey));
    assert.equal(
      rows.length,
      1,
      `expected exactly 1 profile_fields row for key="${testKey}" after 2 upserts, found ${rows.length}`,
    );
    assert.equal(
      rows[0].value,
      "second value",
      `expected the SECOND upsert's value to win, got "${rows[0].value}"`,
    );
    console.log(
      "PASS: upsertProfileField upserts by key (1 row, second value wins)",
    );

    const allFields = await getAllProfileFields();
    const found = allFields.find((field) => field.key === testKey);
    assert.ok(
      found,
      `expected getAllProfileFields() to include the test row (key="${testKey}")`,
    );
    assert.equal(found?.value, "second value");
    console.log("PASS: getAllProfileFields() includes the upserted test row");
  } finally {
    await db.delete(profileFields).where(eq(profileFields.key, testKey));
    const leftover = await db
      .select()
      .from(profileFields)
      .where(eq(profileFields.key, testKey));
    assert.equal(
      leftover.length,
      0,
      `expected the test row (key="${testKey}") to be deleted, but it is still present`,
    );
    console.log("Cleanup: test row removed, live data left untouched.");
  }

  // Behaviors 1-3 (Task 2): updateProfileFieldValue — a deliberately NOT-an-
  // upsert function, only ever called from the pencil-edit popover on a row
  // that already exists.
  const editKey = "zzzz_verify_profile_edit_test_field_zzzz";
  const editLabel = "Zzzz Verify Profile Edit Test Field Zzzz";

  try {
    await upsertProfileField({
      key: editKey,
      label: editLabel,
      value: "original value",
      category: "contacto",
      source: "manual",
    });

    // Behavior 1: updateProfileFieldValue touches ONLY value (+ updatedAt),
    // leaving label/category/source intact.
    const updated = await updateProfileFieldValue(editKey, "updated value");
    assert.equal(
      updated,
      true,
      "expected updateProfileFieldValue to return true for an existing key",
    );
    const [afterUpdate] = await db
      .select()
      .from(profileFields)
      .where(eq(profileFields.key, editKey));
    assert.equal(afterUpdate.value, "updated value");
    assert.equal(
      afterUpdate.label,
      editLabel,
      "expected label to remain untouched by updateProfileFieldValue",
    );
    assert.equal(
      afterUpdate.category,
      "contacto",
      "expected category to remain untouched by updateProfileFieldValue",
    );
    assert.equal(
      afterUpdate.source,
      "manual",
      "expected source to remain untouched by updateProfileFieldValue",
    );
    console.log(
      "PASS: updateProfileFieldValue updates only value/updatedAt, leaving label/category/source intact",
    );

    // Behavior 2: a nonexistent key is a silent no-op (returns false), NEVER
    // creates a new row — unlike upsertProfileField.
    const nonexistentKey = "zzzz_verify_profile_nonexistent_key_zzzz";
    const noopResult = await updateProfileFieldValue(
      nonexistentKey,
      "should never be written",
    );
    assert.equal(
      noopResult,
      false,
      "expected updateProfileFieldValue on a nonexistent key to return false",
    );
    const [shouldNotExist] = await db
      .select()
      .from(profileFields)
      .where(eq(profileFields.key, nonexistentKey));
    assert.equal(
      shouldNotExist,
      undefined,
      "expected updateProfileFieldValue to never create a row for a nonexistent key",
    );
    console.log(
      "PASS: updateProfileFieldValue on a nonexistent key is a no-op (no row created, returns false)",
    );

    // Behavior 3: two sequential calls on the same key leave the SECOND
    // call's value (last write wins, same criterion as Task 1's upsert).
    await updateProfileFieldValue(editKey, "third value");
    await updateProfileFieldValue(editKey, "fourth value");
    const [afterTwoMoreUpdates] = await db
      .select()
      .from(profileFields)
      .where(eq(profileFields.key, editKey));
    assert.equal(afterTwoMoreUpdates.value, "fourth value");
    console.log(
      "PASS: two sequential updateProfileFieldValue calls leave the second call's value",
    );
  } finally {
    await db.delete(profileFields).where(eq(profileFields.key, editKey));
    const leftover = await db
      .select()
      .from(profileFields)
      .where(eq(profileFields.key, editKey));
    assert.equal(
      leftover.length,
      0,
      `expected the test row (key="${editKey}") to be deleted, but it is still present`,
    );
    console.log("Cleanup: edit-test row removed, live data left untouched.");
  }

  // Behavior 4 (Task 3, data-level): upsert 3 of the 6 PROFILE-02 seed
  // fields (simulating Juan leaving the other 3 blank in "Cargar datos
  // básicos") and confirm getAllProfileFields() returns exactly those 3,
  // groupable under "contacto"/"links". The actual browser-level "empty
  // inputs are never sent" filter is confirmed by the plan's human-check,
  // not here — this only confirms the data layer groups correctly once
  // rows exist.
  const seedKeys = [
    "zzzz_verify_nombre_completo_zzzz",
    "zzzz_verify_link_cv_resume_zzzz",
    "zzzz_verify_linkedin_zzzz",
  ];
  try {
    await upsertProfileField({
      key: seedKeys[0],
      label: "Zzzz Nombre completo Zzzz",
      value: "Juan Pérez",
      category: "contacto",
      source: "manual",
    });
    await upsertProfileField({
      key: seedKeys[1],
      label: "Zzzz Link CV/resume Zzzz",
      value: "https://example.com/cv.pdf",
      category: "links",
      source: "manual",
    });
    await upsertProfileField({
      key: seedKeys[2],
      label: "Zzzz LinkedIn Zzzz",
      value: "https://linkedin.com/in/juan",
      category: "links",
      source: "manual",
    });

    const allFields = await getAllProfileFields();
    const seedRows = allFields.filter((field) => seedKeys.includes(field.key));
    assert.equal(
      seedRows.length,
      3,
      `expected exactly 3 seed rows (the ones with a non-empty value), found ${seedRows.length}`,
    );
    const contactoRows = seedRows.filter((row) => row.category === "contacto");
    const linksRows = seedRows.filter((row) => row.category === "links");
    assert.equal(contactoRows.length, 1, "expected 1 seed row under 'contacto'");
    assert.equal(linksRows.length, 2, "expected 2 seed rows under 'links'");
    console.log(
      "PASS: 3 of 6 seed fields upsert as exactly 3 rows, grouped 1 'contacto' + 2 'links'",
    );
  } finally {
    for (const key of seedKeys) {
      await db.delete(profileFields).where(eq(profileFields.key, key));
    }
    const leftover = await db
      .select()
      .from(profileFields)
      .where(eq(profileFields.key, seedKeys[0]));
    assert.equal(leftover.length, 0, "expected seed test rows to be deleted");
    console.log("Cleanup: seed test rows removed, live data left untouched.");
  }

  console.log("All profile behaviors verified against live Postgres.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Profile verification FAILED:", error);
    process.exit(1);
  });
