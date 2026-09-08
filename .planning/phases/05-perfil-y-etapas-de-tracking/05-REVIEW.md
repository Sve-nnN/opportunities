---
phase: 05-perfil-y-etapas-de-tracking
reviewed: 2026-09-08T00:00:00Z
depth: deep
files_reviewed: 9
files_reviewed_list:
  - src/db/schema.ts
  - src/db/queries/profile.ts
  - src/app/actions/profile.ts
  - src/components/dashboard/profile-tab.tsx
  - src/lib/profile-key.ts
  - src/lib/application-status.ts
  - src/app/actions/applications.ts
  - src/components/dashboard/status-dropdown.tsx
  - src/app/page.tsx
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-09-08
**Depth:** deep (cross-file: page.tsx wiring, NotesPopover pattern comparison, drizzle migration vs. schema.ts diff)
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Reviewed the `profile_fields` EAV subsystem (schema, queries, Server Actions, `ProfileTab`) and the 3-status tracking extension (`application-status.ts`, `applications.ts`, `status-dropdown.tsx`). The read-only-status defense-in-depth (T-05-04) is implemented correctly — `MANUALLY_SELECTABLE_STATUSES` genuinely gates both the UI (`SelectContent`) and the server (`statusSchema`), and `key` is never accepted from the client for profile fields (T-05-01), confirmed by direct inspection of both Server Actions. The "no bearer secret needed" framing is correct: these are same-origin Next.js Server Actions, not a new public API route, and there's no auth bypass here.

The main defect is a real, provable data-corruption path: `normalizeToKey` is not injective (many distinct labels can normalize to the same `key`), and `upsertProfileField`'s `onConflictDoUpdate` overwrites `label`/`category`/`value` on a key collision with zero user-facing feedback that a collision (rather than a fresh insert) occurred. The remaining findings are UX/robustness gaps in the newly-authored code: a silent state-desync in the pencil-edit popover, case-sensitive category grouping with no normalization, and a StatusDropdown crash risk on an out-of-enum status value.

## Critical Issues

### CR-01: Non-injective key normalization causes silent field collision and overwrite (data loss)

**File:** `src/lib/profile-key.ts:13-19`, `src/db/queries/profile.ts:38-54`, `src/components/dashboard/profile-tab.tsx:145-161`
**Issue:** `normalizeToKey` lowercases and collapses every run of non-`[a-z0-9]` characters to a single underscore. This is many-to-one: `"LinkedIn"` and `"linkedin"` both normalize to `key = "linkedin"`; `"Link CV/resume"` and `"Link CV resume"` both normalize to `"link_cv_resume"`; a label made only of punctuation (e.g. `"???"`, all non-Latin script) normalizes to `key = ""`. Since `profileFields.key` is `UNIQUE` and `upsertProfileField` (`db/queries/profile.ts:38-54`) does `onConflictDoUpdate` on that key, setting `label`/`value`/`category`/`source` unconditionally, a second field whose label happens to collide with an existing key **silently overwrites the first field's label, value, and category** — Juan believes he added a second, independent field (the "+ Agregar campo" popover shows "Guardado" either way, `AddFieldPopover.handleSave` in `profile-tab.tsx:145-161` never distinguishes insert vs. update), but the row count doesn't change and the original field's data is gone with no warning, error, or undo path. This is a real data-loss bug, not just an edge case someone would need to deliberately construct — accidental re-typing of an existing label with different casing/spacing (e.g. adding "LinkedIn" a second time after already having one) is a completely ordinary user action.
**Fix:** Either (a) make `upsertProfileField` reject/warn on a key collision where the existing row's `label` differs from the incoming `label` (surface this back through `saveProfileFields`'s result so the UI can show "ya existe un campo similar" instead of "Guardado"), or (b) have `saveProfileFields` check `getAllProfileFields()` for an existing row with the same derived key and, if the existing `label` differs from the new one, disambiguate the key (e.g. append a numeric suffix) instead of silently colliding:
```ts
// db/queries/profile.ts
export async function upsertProfileField(
  input: UpsertProfileFieldInput,
): Promise<{ collided: boolean }> {
  const existing = await db
    .select({ label: profileFields.label })
    .from(profileFields)
    .where(eq(profileFields.key, input.key));

  const collided = existing.length > 0 && existing[0].label !== input.label;

  await db.insert(profileFields).values(input).onConflictDoUpdate({
    target: profileFields.key,
    set: { label: input.label, value: input.value, category: input.category, source: input.source, updatedAt: new Date() },
  });

  return { collided };
}
```
and surface `collided` back to the popover so it can warn Juan before/after the overwrite rather than reporting a plain "Guardado".

## Warnings

### WR-01: Pencil-edit popover leaves UI silently out of sync with the DB on validation failure

**File:** `src/components/dashboard/profile-tab.tsx:267-289`, `src/app/actions/profile.ts:22,84-109`
**Issue:** `EditFieldPopover.handleChange` sets local `value` state on every keystroke and never reverts it on failure — only `console.error` is called and `saveState` resets to `"idle"`. `updateProfileFieldValue`'s `valueSchema` (`app/actions/profile.ts:22`) requires `.trim().min(1)`, unlike `NotesPopover`'s `notesSchema` (`app/actions/applications.ts:29`, `z.string().max(2000)`, no `.min(1)`) which explicitly allows clearing a note to empty. So if Juan clears a profile field's value (or types only whitespace) intending to blank it out, the debounced save is rejected server-side, but the input keeps showing the whitespace/blank text he typed, `saveState` shows nothing ("Guardado"/"Guardando…" both clear), and the actual DB row still holds the old value — with zero visible indication anything went wrong. The mismatch persists until a full page reload re-syncs `value` from the `field` prop.
**Fix:** On failure, either revert `value` to `field.value` or surface a visible inline error instead of a silent idle reset:
```ts
if (result.ok) {
  setSaveState("saved");
} else {
  console.error(`[EditFieldPopover] failed to save value for ${field.key}:`, result.error);
  setValue(field.value); // revert to last-known-good instead of leaving the invalid text displayed
  setSaveState("idle");
}
```

### WR-02: `category` grouping is case/format-sensitive with no normalization, unlike `key`

**File:** `src/components/dashboard/profile-tab.tsx:76-93`
**Issue:** `key` gets a dedicated normalization function (`normalizeToKey`) specifically so that visually-different-but-semantically-same labels don't fragment the data model. `category` gets no equivalent treatment: `groupByCategory` and `distinctCategories` do exact string comparison. The `datalist` in `AddFieldPopover` is meant to guide Juan toward reusing an existing category, but it's freely typeable, so `"contacto"` (from the bulk-seed) and `"Contacto"` (typed by hand later) become two separate, identically-labeled group headings in the UI — directly undermining PROFILE-01's "agrupado por categoría" promise, since Juan now has to notice and manually reconcile duplicate-looking groups.
**Fix:** Normalize category comparison (e.g., case-insensitive compare when grouping, or store a normalized `categoryKey` alongside the free-text `category` the same way `key`/`label` are split) so a typo in casing doesn't create a phantom second group.

### WR-03: `StatusDropdown` has no defensive fallback for an out-of-enum `status` value

**File:** `src/components/dashboard/status-dropdown.tsx:130`
**Issue:** `applications.status` remains a free-text Postgres column (deliberately, no migration for the new statuses). `STATUS_META[status].Icon` is accessed unconditionally at `status-dropdown.tsx:130` with no guard. Today, the only writers of `status` are Zod-gated (`statusSchema` = `MANUALLY_SELECTABLE_STATUSES`, and the ad hoc `scripts/verify-status-extension.ts` which only ever writes one of the 9 known values), so this doesn't currently trigger. But since the column has no DB-level `CHECK` constraint, any future writer (Phase 6's callback API, a hand-edited row, a typo'd constant) that writes a 10th string value will crash `StatusDropdown` with `Cannot read properties of undefined (reading 'Icon')` for that row, taking down the whole table render (React error boundary permitting, or a hard crash if none is mounted above it).
**Fix:** Add a fallback entry or guard:
```ts
const meta = STATUS_META[status] ?? { label: status, Icon: CircleDashed };
const CurrentIcon = meta.Icon;
```

### WR-04: Server Action calls in `profile-tab.tsx` have no try/catch around thrown (non-`{ok:false}`) failures

**File:** `src/components/dashboard/profile-tab.tsx:147-161, 273-288, 386-398`
**Issue:** All three popovers call their Server Action as `const result = await saveProfileFields(...)` / `await updateProfileFieldValue(...)` inside `startTransition(async () => { ... })` with no `try/catch`. Both Server Actions only return `{ ok: false, error }` for validation failures — a genuine exception (DB connection drop, Postgres timeout) propagates as a rejected promise from the Server Action call. An uncaught rejection inside an async transition callback is not caught by React's render-time error boundaries; it surfaces only as a generic unhandled-promise-rejection console entry, and `saveState`/`isPending` are left stuck mid-flight with no recovery path for the user (the popover just looks permanently "Guardando…" or reverts to a blank state with no actionable feedback).
**Fix:** Wrap each Server Action call in a try/catch so failures degrade the same way regardless of whether they come back as `{ok:false}` or a thrown error:
```ts
startTransition(async () => {
  try {
    const result = await saveProfileFields([{ label, value, category }]);
    if (result.ok) { /* ... */ } else { /* ... */ }
  } catch (err) {
    console.error("[ProfileTab] unexpected error saving field:", err);
    setSaveState("idle");
  }
});
```
(Note: this pattern is inherited from `NotesPopover`/`StatusDropdown`, so it's not unique to this phase — but it was carried forward unchanged into 3 new call sites here rather than being addressed.)

## Info

### IN-01: `saveProfileFields`'s `savedCount` is computed but never consumed

**File:** `src/app/actions/profile.ts:42-70`, `src/components/dashboard/profile-tab.tsx:147-161, 386-398`
**Issue:** `SaveProfileFieldsResult.savedCount` is returned on success but neither `AddFieldPopover` nor `BulkLoadPopover` reads it — both only branch on `result.ok`. If a batch partially fails (some entries silently dropped by per-entry Zod validation, per the documented "silent-drop" design), the caller has no way to tell Juan "5 of 6 campos guardados" vs. "6 of 6" — both show the same "Guardado" text. Currently low-impact since `BulkLoadPopover`'s 6 seed labels/categories are hardcoded short strings that can't fail length validation, but the field exists specifically for this purpose and is dead code as written.
**Fix:** Compare `result.savedCount` to `entries.length` and surface a distinct message when they differ, e.g. `"Guardado (${result.savedCount}/${entries.length})"`.

### IN-02: `profile.ts` Server Actions hardcode `revalidatePath("/")` instead of accepting a path parameter

**File:** `src/app/actions/profile.ts:67, 106`
**Issue:** `applications.ts`'s `updateApplicationStatus`/`updateApplicationNotes` both accept a `pathToRevalidate` parameter validated via `pathSchema` (defaulting to `"/"` at the call site). `profile.ts`'s two Server Actions instead hardcode the literal `"/"`. This works today because the dashboard is a single page, but it's an inconsistent pattern within the same codebase/phase for no documented reason, and any future multi-page addition would silently miss the profile tab's revalidation.
**Fix:** Match the existing convention for consistency, even if the default value is always used today:
```ts
export async function saveProfileFields(
  entries: { label: string; value: string; category: string }[],
  pathToRevalidate = "/",
): Promise<SaveProfileFieldsResult> { /* ... revalidatePath(pathToRevalidate) */ }
```

### IN-03: Save-indicator JSX/logic duplicated 3 times

**File:** `src/components/dashboard/profile-tab.tsx:228-234, 321-327, 434-440`
**Issue:** The `aria-live="polite"` paragraph plus the `saveState === "saving" || isPending ? "Guardando…" : saveState === "saved" ? "Guardado" : " "` ternary is copy-pasted verbatim across `AddFieldPopover`, `EditFieldPopover`, and `BulkLoadPopover` (and a 4th time already in `NotesPopover`). Any future change to this UX (e.g., adding an error state) now needs to be made in 3-4 places in sync.
**Fix:** Extract a small shared `<SaveIndicator saveState={saveState} isPending={isPending} />` component.

---

_Reviewed: 2026-09-08_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
