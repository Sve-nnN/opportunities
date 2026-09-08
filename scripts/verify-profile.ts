import assert from "node:assert/strict";

import { eq } from "drizzle-orm";
import { chromium } from "playwright";

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
 *
 * Data-layer only. A separate browser layer (Nyquist gap-fill,
 * 05-VALIDATION.md) runs when a baseUrl arg is given — it exercises real
 * clicks/keystrokes through "+ Agregar campo", the pencil-edit debounced
 * autosave, and "Cargar datos básicos"'s blank-input filter, none of which
 * 05-01-SUMMARY.md/05-VERIFICATION.md ever drove through an actual browser
 * (only curl HTML inspection + the data-layer behaviors above):
 *
 *   DATABASE_URL=postgresql://postgres:devpassword@127.0.0.1:5434/opportunities \
 *     pnpm exec tsx scripts/verify-profile.ts http://localhost:3921
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

/**
 * Browser layer (Nyquist gap-fill): drives a real Chromium session against
 * a running `pnpm dev` instance, exercising the 3 interactions
 * 05-01-SUMMARY.md itself flagged as `human_judgment: true` / deferred to
 * `human_verify_mode: end-of-phase` and which 05-VERIFICATION.md only
 * partially closed via curl (render layer, no actual click/type/debounce).
 *
 * Behavior A: "+ Agregar campo" — open popover, type category/label/value,
 * click Guardar, confirm the field renders grouped under its category
 * without a page reload (React state + revalidatePath), popover stays open.
 *
 * Behavior B: pencil-edit inline autosave — open the edit popover on an
 * existing field, type a new value, confirm "Guardando…" appears, wait past
 * the 500ms debounce, confirm "Guardado" appears with NO explicit Save
 * button ever clicked, and that the new value persists after a reload.
 *
 * Behavior C: "Cargar datos básicos" blank-input filter — open the bulk
 * popover, fill only 2 of 6 inputs, save, confirm the popover closes and
 * exactly 2 new fields render (not 6) — proving the client-side blank
 * filter actually suppresses empty rows in a real form submission, not just
 * in the already-covered data-layer re-validation.
 */
async function verifyBrowserLayer(baseUrl: string) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const testKeys: string[] = [];

  // Juan's real profile_fields rows may already exist (this is a live-data
  // feature, not a fixture). `BulkLoadPopover` (Behavior C) only renders in
  // the zero-fields empty state (profile-tab.tsx: `fields.length === 0`), so
  // snapshot and clear the real rows first, run all 3 behaviors against a
  // known-empty starting state, then restore the exact original rows in
  // `finally` regardless of pass/fail.
  const originalRows = await db.select().from(profileFields);

  try {
    if (originalRows.length > 0) {
      await db.delete(profileFields);
      console.log(
        `Snapshotted and cleared ${originalRows.length} real profile_fields row(s) for the browser layer (will be restored).`,
      );
    }

    await page.goto(`${baseUrl}/?tab=profile`, { waitUntil: "networkidle" });

    // --- Behavior C: "Cargar datos básicos" blank-input filter ---
    // Run first: the button only exists in the empty-profile state, which
    // is only guaranteed true right now (before Behavior A adds a row).
    const bulkTrigger = page.getByRole("button", { name: "Cargar datos básicos" });
    await bulkTrigger.click();
    await page.getByLabel("Nombre completo").fill("Zzzz Playwright Nombre Zzzz");
    await page.getByLabel("Email").fill("zzzz-playwright@example.com");
    // Leave Teléfono, Link CV/resume, LinkedIn, GitHub blank on purpose.
    testKeys.push(normalizeToKey("Nombre completo"), normalizeToKey("Email"));

    const bulkPopoverContent = page.locator('[data-slot="popover-content"]', {
      hasText: "Nombre completo",
    });
    await bulkPopoverContent.getByRole("button", { name: "Guardar" }).click();

    // UI-SPEC: bulk popover closes on success (unlike "+ Agregar campo").
    await bulkPopoverContent.waitFor({ state: "hidden", timeout: 5000 });

    await assertVisible(
      page,
      "Zzzz Playwright Nombre Zzzz",
      "expected the non-blank 'Nombre completo' bulk field to be created",
    );
    await assertVisible(
      page,
      "zzzz-playwright@example.com",
      "expected the non-blank 'Email' bulk field to be created",
    );
    const rowsAfterBulk = await db.select().from(profileFields);
    assert.equal(
      rowsAfterBulk.length,
      2,
      `expected exactly 2 rows created from the bulk popover (2 non-blank of 6), found ${rowsAfterBulk.length}`,
    );
    console.log(
      "PASS (browser): 'Cargar datos básicos' only creates rows for non-blank inputs (2 of 6 sent, 4 left blank)",
    );

    // --- Behavior A: "+ Agregar campo" ---
    const addLabel = "Zzzz Playwright Add Field Zzzz";
    testKeys.push(normalizeToKey(addLabel));

    await page.getByRole("button", { name: "+ Agregar campo" }).click();
    await page.getByLabel("Categoría").fill("zzzz_playwright_cat");
    await page.getByLabel("Etiqueta").fill(addLabel);
    await page.getByLabel("Valor").fill("valor de prueba");
    await page.getByRole("button", { name: "Guardar" }).click();

    await page.getByText("Guardado", { exact: true }).waitFor({ timeout: 5000 });
    await page.keyboard.press("Escape");

    await assertVisible(
      page,
      addLabel,
      "expected the newly added field's label to render after '+ Agregar campo' save (no reload)",
    );
    console.log(
      "PASS (browser): '+ Agregar campo' popover creates a real field visible without reload",
    );

    // --- Behavior B: pencil-edit debounced autosave ---
    const editButton = page.getByRole("button", { name: `Editar ${addLabel}` });
    await editButton.click();
    const editInput = page.getByLabel(addLabel, { exact: true });
    await editInput.fill("");
    await editInput.type("valor editado", { delay: 20 });

    // Immediately after typing (before the 500ms debounce fires), the
    // save-state row must show "Guardando…" — this is the actual proof of
    // debounce timing that curl/data-layer checks cannot exercise.
    await page.getByText("Guardando…", { exact: true }).waitFor({ timeout: 400 });
    await page.getByText("Guardado", { exact: true }).waitFor({ timeout: 3000 });
    await page.keyboard.press("Escape");

    await page.reload({ waitUntil: "networkidle" });
    await assertVisible(
      page,
      "valor editado",
      "expected the debounced-autosaved value to persist after a reload",
    );
    console.log(
      "PASS (browser): pencil-edit popover autosaves on debounce, no explicit Save button, persists after reload",
    );

  } finally {
    for (const key of testKeys) {
      await db.delete(profileFields).where(eq(profileFields.key, key));
    }
    if (originalRows.length > 0) {
      // Restore exactly what was there before this run (values only — id/
      // createdAt are regenerated, but key/label/value/category/source and
      // relative insertion order are preserved).
      await db.delete(profileFields);
      for (const row of originalRows) {
        await db.insert(profileFields).values({
          key: row.key,
          label: row.label,
          value: row.value,
          category: row.category,
          source: row.source,
        });
      }
      const restored = await db.select().from(profileFields);
      assert.equal(
        restored.length,
        originalRows.length,
        "expected all original real profile_fields rows to be restored",
      );
      console.log(
        `Restored ${originalRows.length} real profile_fields row(s) — live data left untouched.`,
      );
    }
    await browser.close();
    console.log("Cleanup (browser layer): all Playwright-created test rows removed.");
  }
}

async function assertVisible(
  page: import("playwright").Page,
  text: string,
  message: string,
) {
  const locator = page.getByText(text, { exact: false }).first();
  await locator.waitFor({ state: "visible", timeout: 5000 }).catch(() => {
    throw new assert.AssertionError({ message: `${message} (text: "${text}")` });
  });
}

async function run() {
  await main();
  const baseUrl = process.argv[2];
  if (baseUrl) {
    await verifyBrowserLayer(baseUrl);
  } else {
    console.log(
      "Skipping browser layer (no baseUrl arg) — run with a dev-server URL, e.g.:\n" +
        "  pnpm exec tsx scripts/verify-profile.ts http://localhost:3921",
    );
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Profile verification FAILED:", error);
    process.exit(1);
  });
