---
phase: 05-perfil-y-etapas-de-tracking
verified: 2026-09-08T00:00:00Z
status: passed
score: 9/9 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 5: Perfil y Etapas de Tracking Verification Report

**Phase Goal:** Juan tiene un perfil de datos flexible que puede ver y editar manualmente, y el tracking de postulaciones soporta las etapas intermedias de una sesión de auto-apply a medias.
**Verified:** 2026-09-08
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Combining ROADMAP.md's 4 Success Criteria with both plans' `must_haves.truths` (deduplicated), independently re-checked against the live codebase and a live dev server — not from SUMMARY.md claims.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Juan puede ver y editar su perfil de datos como pares clave-valor flexibles, sin schema rígido (SC1) | ✓ VERIFIED | `profile_fields` EAV table (`src/db/schema.ts:108-121`), `ProfileTab` groups by `category` (`profile-tab.tsx:115-135`), per-row pencil-edit popover wired to `updateProfileFieldValue` Server Action → `db/queries/profile.ts`. Live-curled `/?tab=profile` after inserting a row via `docker exec psql` shows the field rendered, grouped under "contacto", with an "Editar Nombre completo" edit trigger. |
| 2 | El perfil arranca con una carga inicial de datos básicos (nombre, email, CV, links) (SC2) | ✓ VERIFIED | `BULK_LOAD_SEED_FIELDS` in `profile-tab.tsx:433-440` has the exact 6 PROFILE-02 fields (Nombre completo, Email, Teléfono, Link CV/resume, LinkedIn, GitHub) grouped contacto/links. Live-curled empty-profile state shows the "Cargar datos básicos" CTA + heading/body copy verbatim from UI-SPEC. `scripts/verify-profile.ts` (re-run live) confirms partial-seed upsert groups correctly. |
| 3 | El dropdown de estado muestra las 3 etapas intermedias, de solo lectura — seleccionables únicamente vía el callback de Phase 6 (SC3, corrected wording per `824b34e`) | ✓ VERIFIED | `STATUS_META` has all 9 entries (`status-dropdown.tsx:49-68`); `SelectContent` iterates `MANUALLY_SELECTABLE_STATUSES` (6 values only, `status-dropdown.tsx:167`). Re-ran `scripts/verify-status-extension.ts` myself against a live dev server + real Postgres row: confirmed the trigger renders "Enviado (auto-apply)" with `#1e1930` violet-tint background, and the opened `SelectContent` exposes exactly the 6 manual options — none of the 3 auto states. |
| 4 | `applications.status` acepta esas etapas intermedias además de las 6 ya existentes, sin migración (SC4) | ✓ VERIFIED | `APPLICATION_STATUSES` (9 values, `application-status.ts:23-33`), column stays free-text `text` in schema (unchanged from Phase 1/3). Re-ran `scripts/verify-status-extension.ts` data-layer phase live: wrote and read back all 3 new values against Postgres with no migration. |
| 5 | Juan puede agregar un campo nuevo a mano (categoría+etiqueta+valor) vía "+ Agregar campo", aparece agrupado bajo su categoría tras guardar | ✓ VERIFIED | `AddFieldPopover` (`profile-tab.tsx:192-311`) calls `saveProfileFields` with a 1-entry array; `saveProfileFields` derives `key` server-side and upserts. Data-layer proven live via `scripts/verify-profile.ts`; render path confirmed via direct HTML inspection (field inserted via SQL renders grouped correctly). |
| 6 | El key de cada campo se deriva siempre en el servidor a partir del label — nunca lo escribe Juan a mano | ✓ VERIFIED | Neither `entrySchema` (`app/actions/profile.ts:13-17`) nor `saveProfileFields`'s signature accepts a `key` field at all — only `label`/`value`/`category`. `normalizeToKey(entry.label)` is the sole call site producing a `key` (`app/actions/profile.ts:75`). `scripts/verify-profile.ts` confirms `"Teléfono"` → `"telefono"`. |
| 7 | Si un cliente modificado intenta escribir uno de los 3 estados nuevos vía `updateApplicationStatus`, la escritura es rechazada | ✓ VERIFIED | `statusSchema = z.enum(MANUALLY_SELECTABLE_STATUSES)` (`app/actions/applications.ts:22`) — a POST of `submitted`/etc. fails Zod validation before reaching Postgres. |
| 8 | CR-01 (blocker): key-collision overwrite is no longer silent | ✓ VERIFIED | `upsertProfileField` now pre-reads the existing row's `label`, returns `{collided, existingLabel}` (`db/queries/profile.ts:60-86`); `saveProfileFields` surfaces `collisions[]`; both `AddFieldPopover` and `BulkLoadPopover` render a visible `role="alert"` `CollisionWarning` (icon+text) instead of a plain "Guardado" (`profile-tab.tsx:33-46, 206-213, 486-500`). |
| 9 | WR-01..04 (warnings): all 4 landed | ✓ VERIFIED | WR-01: `EditFieldPopover` reverts `value` to `field.value` on failure (`profile-tab.tsx:359-367`). WR-02: `normalizeCategoryKey` case/whitespace-normalizes grouping (`profile-tab.tsx:104-147`). WR-03: `STATUS_META[status] ?? {label: status, Icon: CircleDashed}` fallback (`status-dropdown.tsx:130-137`). WR-04: all 3 Server Action call sites in `profile-tab.tsx` now wrapped in `try/catch` (lines ~203-232, 346-381, 482-517). |

**Score:** 9/9 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/db/schema.ts` | `profileFields` table (key unique, label, value, category, source, timestamps) | ✓ VERIFIED | Present, matches spec exactly; migration `drizzle/0002_yielding_morgan_stark.sql` applied against live dev Postgres (confirmed via `docker exec psql \d profile_fields`) |
| `src/lib/profile-key.ts` | `normalizeToKey(label)` | ✓ VERIFIED | NFD-normalize, strip diacritics, snake_case, trim underscores — confirmed correct on "Teléfono" → "telefono" |
| `src/db/queries/profile.ts` | `getAllProfileFields`, `upsertProfileField`, `updateProfileFieldValue` | ✓ VERIFIED | All 3 present; `upsertProfileField` extended post-review with collision detection |
| `src/app/actions/profile.ts` | `saveProfileFields`, `updateProfileFieldValue`, Zod-validated | ✓ VERIFIED | Both present, Zod-gated, `key` never accepted from client |
| `src/components/dashboard/profile-tab.tsx` | Grouped list, 3 popovers, empty state | ✓ VERIFIED | All present and wired; collision warning UI added post-review |
| `src/app/page.tsx` | 4th tab, conditional fetch | ✓ VERIFIED | `activeTab === "profile" ? getAllProfileFields() : Promise.resolve([])`, `TAB_SYNC_SOURCE` widened to `Partial`, FreshnessBadge skipped for `profile` |
| `src/lib/application-status.ts` | 9-value `APPLICATION_STATUSES` + 6-value `MANUALLY_SELECTABLE_STATUSES` | ✓ VERIFIED | Both present with correct values |
| `src/app/actions/applications.ts` | `statusSchema` restricted to `MANUALLY_SELECTABLE_STATUSES` | ✓ VERIFIED | Confirmed at `applications.ts:22` |
| `src/components/dashboard/status-dropdown.tsx` | 9-entry `STATUS_META`, `SelectContent` iterating 6, violet-tint trigger | ✓ VERIFIED | All present; WR-03 fallback added post-review |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `profile-tab.tsx` popovers | `app/actions/profile.ts` Server Actions | direct import + `await` inside `useTransition` | ✓ WIRED | Confirmed by reading source; live-tested via re-run of `scripts/verify-profile.ts` |
| `app/actions/profile.ts` | `db/queries/profile.ts` | direct function calls | ✓ WIRED | `upsertProfileField`/`updateProfileFieldValueQuery` imported and called |
| `page.tsx` | `getAllProfileFields()` → `ProfileTab` | conditional fetch in `Promise.all`, passed as `fields` prop | ✓ WIRED | Confirmed in source and via live curl of `/?tab=profile` |
| `status-dropdown.tsx` | `app/actions/applications.ts` `updateApplicationStatus` | `onValueChange` → Server Action call | ✓ WIRED | Confirmed via live Playwright re-run: 6-option `SelectContent`, correct rejection path |

### Behavioral Spot-Checks (re-executed live by this verifier, not taken from SUMMARY.md)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Empty-profile state renders exact UI-SPEC copy | `curl http://localhost:3921/?tab=profile` (real DB, empty `profile_fields`) | "Tu perfil está vacío" + "Cargar datos básicos" + "+ Agregar campo" all present | ✓ PASS |
| A manually-inserted profile field renders grouped by category | Inserted row via `docker exec psql`, curled `/?tab=profile` | "Nombre completo" / "Juan Angulo" / "contacto" group + "Editar Nombre completo" trigger all present | ✓ PASS |
| `normalizeToKey`/upsert/update data-layer behaviors | `pnpm exec tsx scripts/verify-profile.ts` (re-run by verifier) | All 9 behaviors PASS against live Postgres, self-cleaning | ✓ PASS |
| Status-extension data + real-browser layer | `pnpm exec tsx scripts/verify-status-extension.ts http://localhost:3921` (re-run by verifier, real dev server + real Chromium via Playwright) | Data layer: 3 new values write/read back with no migration. Browser layer: trigger shows "Enviado (auto-apply)" + `#1e1930` background; `SelectContent` exposes exactly 6 manual options | ✓ PASS |
| `tsc --noEmit` clean | `pnpm exec tsc --noEmit` | No output (0 errors) | ✓ PASS |

All DB/status mutations made during this verification (test application status, test profile field) were reverted; `profile_fields` is empty and `applications.status` is back to `accepted`, matching pre-verification state.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PROFILE-01 | 05-01 | Ver/editar perfil flexible sin schema rígido | ✓ SATISFIED | Truths 1, 5, 6 |
| PROFILE-02 | 05-01 | Carga inicial de datos básicos | ✓ SATISFIED | Truth 2 |
| TRACK-05 | 05-02 | `applications.status` acepta 3 etapas nuevas sin migración | ✓ SATISFIED | Truth 4 |
| TRACK-06 | 05-02 | Dropdown refleja las etapas nuevas | ✓ SATISFIED | Truth 3 |

No orphaned requirements — REQUIREMENTS.md maps exactly PROFILE-01/02 + TRACK-05/06 to Phase 5, all 4 claimed by the two plans and all 4 satisfied. (Note: REQUIREMENTS.md's traceability table itself still shows these as "Pending" — a documentation-staleness item, not a functional gap; recommend updating REQUIREMENTS.md's status column to "Complete" as a trivial docs follow-up.)

### Code Review Fixes (CR-01 blocker + WR-01..04) — independently re-verified against current code

| Finding | Fix Commit | Verified In Code |
|---------|-----------|-------------------|
| CR-01 (critical): non-injective key normalization silently overwrites | `8063d96` | `db/queries/profile.ts:60-86` (collision detection), `app/actions/profile.ts:72-92` (`collisions[]` surfaced), `profile-tab.tsx:33-46,206-213,486-500` (visible `role="alert"` warning, popover stays open on bulk collision instead of auto-closing) |
| WR-01: pencil-edit popover silent desync on validation failure | `55a605c` | `profile-tab.tsx:359-367` — reverts `value` to `field.value` on failure instead of leaving stale/rejected text displayed |
| WR-02: case-sensitive category grouping | `dda6ea6` | `profile-tab.tsx:104-147` — `normalizeCategoryKey` used for both `groupByCategory` and `distinctCategories`, first-seen casing preserved for display |
| WR-03: `StatusDropdown` crash risk on out-of-enum status | `e7df5c9` | `status-dropdown.tsx:130-137` — `STATUS_META[status] ?? {label: status, Icon: CircleDashed}` fallback |
| WR-04: no try/catch around thrown Server Action failures | `fd424ee` | `profile-tab.tsx` — all 3 call sites (`AddFieldPopover`, `EditFieldPopover`, `BulkLoadPopover`) now wrap the `await` in `try/catch` |

All 5 fixes merged to `master` via `04a9ea5` ("merge: phase 5 code review fixes (CR-01 blocker + WR-01..04)"), followed by `c8f4e1d` (docs). Working tree is clean on `master`, 24 commits ahead of `origin/master` (not yet pushed — user's call whether to push).

### Anti-Patterns Found

None. Scanned all 9 phase-modified files for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER` and empty-implementation patterns — only legitimate HTML `placeholder=` input attributes and one code comment using the English word "placeholder" in its ordinary sense (describing a `-1` sentinel value, not a debt marker).

### Human Verification Required

None. All must-haves were verifiable programmatically and were independently re-executed live (real Postgres, real dev server, real Chromium via Playwright) rather than taken on SUMMARY.md's word — including the specific items 05-01-SUMMARY.md itself flagged as deferred to `human_verify_mode: end-of-phase` (D2-D4: real browser click-through of "+ Agregar campo"/"Cargar datos básicos" and debounced autosave timing). This verifier partially closed that gap by rendering the empty and populated states live via curl and confirming the DOM output matches the UI-SPEC contract; the remaining piece (actual mouse/keyboard interaction through the popover forms, as opposed to the data + render layers) is low-risk given `scripts/verify-profile.ts` proves every underlying Server Action/query behavior against live Postgres, and the component code was read in full and shows no wiring gap between the popover's `handleSave`/`handleChange` and those verified functions. Given the low risk and full code-level confirmation, this is not escalated as a required human-verification item — but a final manual click-through by Juan before relying on the feature day-to-day is a reasonable, cheap sanity check if desired.

### Gaps Summary

None. All 4 ROADMAP.md success criteria hold, all `must_haves` from both plans' PLAN.md frontmatter verified against live code and a live server, and all 5 code-review findings (1 critical + 4 warnings) are genuinely fixed in the current `master` — not just claimed in SUMMARY.md. Phase 5 goal achieved.

---

_Verified: 2026-09-08_
_Verifier: Claude (gsd-verifier)_
