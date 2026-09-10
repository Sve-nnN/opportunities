---
phase: 05-perfil-y-etapas-de-tracking
validated: 2026-09-08
status: gaps_filled
gaps_total: 1
gaps_filled: 1
gaps_escalated: 0
---

# Phase 5 Nyquist Validation Report

## Gap Identified

`05-01-SUMMARY.md`'s own `coverage` block flagged three PROFILE-01/PROFILE-02 behaviors as `human_judgment: true`, deferred to `human_verify_mode: end-of-phase`, because the autonomous execution run never drove them through a real browser:

- D2 — clicking through the "+ Agregar campo" popover (real form fill + click, not a SQL insert)
- D3 — the pencil-edit popover's 500ms-debounced autosave (real keystroke timing, "Guardando…"/"Guardado" transition, no explicit Save button ever clicked)
- D4 — "Cargar datos básicos"'s client-side blank-input filter (leaving inputs empty and confirming only non-empty ones are sent, in a real form submission)

`05-VERIFICATION.md` partially closed this by curling rendered HTML after inserting rows directly via SQL — that proves the render layer (grouping, labels) but never exercises an actual click, keystroke, or debounce timer. `scripts/verify-profile.ts` (as it existed) covered only the data layer (`normalizeToKey`, `upsertProfileField`, `updateProfileFieldValue`) with zero Playwright/browser interaction — unlike its sibling `scripts/verify-status-extension.ts`, which already has a browser layer for TRACK-05/06. This asymmetry is the gap: PROFILE-01/02's actual UI interaction was never behaviorally tested, only inferred from code reading + data-layer proof.

**Classification:** `test_fails` / `no_automated_command` for the interaction layer specifically — a real regression here (e.g. a broken `onClick`, a debounce that never fires, a blank-filter that silently breaks) would have shipped undetected by any existing automated command.

## Test Generated

Extended `scripts/verify-profile.ts` with a browser layer (`verifyBrowserLayer`), following the exact convention already established in `scripts/verify-status-extension.ts` (Playwright `chromium.launch()`, runs only when a `baseUrl` CLI arg is given, real dev server required). Three behavioral assertions, run against `http://localhost:3001` (the project's live dev server):

1. **"+ Agregar campo" end-to-end**: opens the popover, types Categoría/Etiqueta/Valor, clicks "Guardar", waits for the real "Guardado" text, and asserts the new field's label is visible in the DOM with zero page reload (proves the React state update + `revalidatePath` round trip, not just the underlying Server Action in isolation).
2. **Pencil-edit debounced autosave**: opens the edit popover on an existing field, types a new value via real keystrokes, asserts "Guardando…" appears *before* the 500ms debounce elapses, asserts "Guardado" appears after, confirms no explicit Save button exists in that popover, reloads the page, and asserts the value persisted — this is the one behavior no data-layer or curl check can prove, since it depends on real timer/keystroke interaction.
3. **"Cargar datos básicos" blank-input filter**: opens the bulk popover, fills only 2 of 6 inputs, clicks "Guardar", asserts the popover closes (per UI-SPEC, unlike "+ Agregar campo") and that **exactly 2** rows exist in Postgres afterward — not 6, proving the client-side blank filter actually suppresses empty submissions in a real form, not just in the already-covered server-side re-validation.

**Test-writing gotcha caught and fixed during this run (real, not cosmetic):** `BulkLoadPopover` only renders inside `profile-tab.tsx`'s `fields.length === 0` branch — it does not exist once any field is present. The first test draft ran Behavior C after Behavior A (which creates a field), so the "Cargar datos básicos" button never appeared and the test correctly timed out with `TimeoutError`. Reordered to run Behavior C first. Separately, discovered Juan's live dev Postgres already has 4 real profile fields (his own manually-entered data, including a deliberate "very long URL" wrap test) — since `BulkLoadPopover` requires an empty starting state, the script now snapshots and clears the real rows before the browser layer, then restores them byte-for-byte in a `finally` block regardless of pass/fail. Restoration was verified by direct `SELECT` after the run: all 4 original rows (`nombre_completo`, `email`, `link_cv_resume`, `url_super_larga`) present with original values.

## Run Result

```
DATABASE_URL=postgresql://postgres:devpassword@127.0.0.1:5434/opportunities \
  pnpm exec tsx scripts/verify-profile.ts http://localhost:3001
```

```
PASS: normalizeToKey produces snake_case, accent-free, no leading/trailing/duplicated underscores
PASS: upsertProfileField upserts by key (1 row, second value wins)
PASS: getAllProfileFields() includes the upserted test row
PASS: updateProfileFieldValue updates only value/updatedAt, leaving label/category/source intact
PASS: updateProfileFieldValue on a nonexistent key is a no-op (no row created, returns false)
PASS: two sequential updateProfileFieldValue calls leave the second call's value
PASS: 3 of 6 seed fields upsert as exactly 3 rows, grouped 1 'contacto' + 2 'links'
Snapshotted and cleared 4 real profile_fields row(s) for the browser layer (will be restored).
PASS (browser): 'Cargar datos básicos' only creates rows for non-blank inputs (2 of 6 sent, 4 left blank)
PASS (browser): '+ Agregar campo' popover creates a real field visible without reload
PASS (browser): pencil-edit popover autosaves on debounce, no explicit Save button, persists after reload
Restored 4 real profile_fields row(s) — live data left untouched.
Cleanup (browser layer): all Playwright-created test rows removed.
```

`pnpm exec tsc --noEmit` — clean, no new errors.

Iterations to green: 2 (1 real test-ordering bug caught and fixed, per above — not an implementation bug, a test-authoring bug against a correctly-scoped-to-empty-state component).

## GAPS FILLED

**Phase:** 5 — Perfil y Etapas de Tracking
**Resolved:** 1/1

### Tests Created
| # | File | Type | Command |
|---|------|------|---------|
| 1 | `scripts/verify-profile.ts` (`verifyBrowserLayer`, appended) | integration (Playwright, real browser + real Postgres) | `DATABASE_URL=postgresql://postgres:devpassword@127.0.0.1:5434/opportunities pnpm exec tsx scripts/verify-profile.ts <devServerUrl>` |

### Verification Map Updates
| Task ID | Requirement | Command | Status |
|---------|-------------|---------|--------|
| 05-01 D2/D3/D4 | PROFILE-01, PROFILE-02 | `pnpm exec tsx scripts/verify-profile.ts http://localhost:3001` | green |

### Files for Commit
- `/Users/juan/Documents/Codigo/Personal/opportunities/scripts/verify-profile.ts`
- `/Users/juan/Documents/Codigo/Personal/opportunities/.planning/phases/05-perfil-y-etapas-de-tracking/05-VALIDATION.md`
