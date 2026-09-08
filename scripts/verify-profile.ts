import assert from "node:assert/strict";

import { eq } from "drizzle-orm";

import { db } from "../src/db/client";
import { profileFields } from "../src/db/schema";
import { getAllProfileFields, upsertProfileField } from "../src/db/queries/profile";
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

  console.log("All profile behaviors verified against live Postgres.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Profile verification FAILED:", error);
    process.exit(1);
  });
