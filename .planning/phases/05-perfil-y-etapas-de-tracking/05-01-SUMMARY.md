---
phase: 05-perfil-y-etapas-de-tracking
plan: 01
subsystem: database, ui
tags: [drizzle, postgres, next.js-server-actions, zod, shadcn-popover, eav-pattern]

# Dependency graph
requires: []
provides:
  - "profile_fields Postgres table (EAV pattern) + migration"
  - "src/lib/profile-key.ts: normalizeToKey(label) - server-side key derivation"
  - "src/db/queries/profile.ts: getAllProfileFields, upsertProfileField, updateProfileFieldValue"
  - "src/app/actions/profile.ts: saveProfileFields, updateProfileFieldValue Server Actions"
  - "src/components/dashboard/profile-tab.tsx: ProfileTab wired as 4th 'Perfil' tab"
affects: [06-callback-api, 07-send-to-ai]

actuals:
  tokens: 11458
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "EAV (entity-attribute-value) table for schema-less user data, key derived server-side only, never client-provided"
    - "Independent per-entry Zod validation in a batch Server Action - invalid entries silently dropped, not a batch failure"

key-files:
  created:
    - src/lib/profile-key.ts
    - src/db/queries/profile.ts
    - src/app/actions/profile.ts
    - src/components/dashboard/profile-tab.tsx
    - scripts/verify-profile.ts
    - drizzle/0002_yielding_morgan_stark.sql
  modified:
    - src/db/schema.ts
    - src/app/page.tsx

key-decisions:
  - "profile_fields.key is UNIQUE and the sole upsert target (never the serial id), matching applications.opportunityExternalId's established convention"
  - "normalizeToKey is the ONLY place a key is derived - no Server Action in this plan accepts a client-provided key (threat_model T-05-01)"
  - "updateProfileFieldValue is deliberately NOT an upsert - a nonexistent key is a silent no-op, since the pencil-edit popover only ever opens on an already-rendered row"
  - "Perfil tab has no pagination/badge count/FreshnessBadge - it's Juan's own manually-edited data, not a GitHub-synced paginated source"

requirements-completed: [PROFILE-01, PROFILE-02]

coverage:
  - id: D1
    description: "Juan can open the 'Perfil' tab and see his current fields grouped by category, no rigid schema"
    requirement: "PROFILE-01"
    verification:
      - kind: integration
        ref: "scripts/verify-profile.ts (Behavior 4: 3-of-6 seed upsert groups correctly under contacto/links)"
        status: pass
      - kind: manual_procedural
        ref: "curl smoke test against pnpm dev: populated-state HTML confirmed 'contacto' group + field label/value + pencil edit trigger"
        status: pass
    human_judgment: false
  - id: D2
    description: "Juan can add a new field by hand via '+ Agregar campo' (category+label+value), and it appears grouped under its category after saving"
    requirement: "PROFILE-01"
    verification:
      - kind: manual_procedural
        ref: "curl smoke test: inserted a field via upsertProfileField, confirmed page.tsx render groups it under 'contacto' with label+value+edit trigger"
        status: pass
    human_judgment: true
    rationale: "The actual browser click-through of the '+ Agregar campo' popover form (as opposed to the underlying persistence/render it depends on) was not driven by a real browser session in this autonomous run - flagged for human_verify_mode: end-of-phase."
  - id: D3
    description: "Juan can inline-edit an existing field's value via the pencil icon, autosave with no explicit 'Guardar' button"
    requirement: "PROFILE-01"
    verification:
      - kind: integration
        ref: "scripts/verify-profile.ts (Behaviors 1-3: updateProfileFieldValue touches only value, no-ops on unknown key, last-write-wins)"
        status: pass
    human_judgment: true
    rationale: "The debounced autosave UX (500ms timer, 'Guardando…'/'Guardado' text) requires real keystroke timing in a browser to confirm visually - flagged for human_verify_mode: end-of-phase."
  - id: D4
    description: "Empty profile shows 'Cargar datos básicos' CTA that creates up to 6 fields at once, skipping blanks"
    requirement: "PROFILE-02"
    verification:
      - kind: integration
        ref: "scripts/verify-profile.ts (Behavior 4: partial seed upsert)"
        status: pass
      - kind: manual_procedural
        ref: "curl smoke test: empty-state HTML confirmed exact heading/body copy + both CTA labels present"
        status: pass
    human_judgment: true
    rationale: "Confirming the bulk popover's client-side blank-filter (leaving 2-3 of 6 inputs empty and observing only non-empty rows persist) requires real form interaction in a browser - flagged for human_verify_mode: end-of-phase."
  - id: D5
    description: "key is always derived server-side (snake_case, no accents/spaces) - never typed by hand"
    requirement: "PROFILE-01"
    verification:
      - kind: unit
        ref: "scripts/verify-profile.ts (normalizeToKey: 'Teléfono' -> 'telefono', 'Link CV/resume' -> 'link_cv_resume')"
        status: pass
    human_judgment: false

# Metrics
duration: ~25min
completed: 2026-09-08
status: complete
---

# Phase 5 Plan 1: Perfil (flexible key-value profile tab) Summary

**profile_fields EAV table + Drizzle queries/Server Actions + "Perfil" dashboard tab with grouped view, inline autosave edit, ad hoc add-field, and 6-field bulk seed load**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-09-08
- **Tasks:** 3 (Task 1 tracer, Task 2 TDD, Task 3)
- **Files modified:** 8 (2 modified, 6 created, plus generated Drizzle migration/meta)

## Accomplishments
- `profile_fields` Postgres table (EAV: key/label/value/category/source + timestamps) with an applied migration, no rigid schema per field
- `normalizeToKey(label)` — the single, server-side-only place a field's `key` is derived (snake_case, diacritics stripped)
- `getAllProfileFields` / `upsertProfileField` / `updateProfileFieldValue` query layer, upsert-by-key matching the codebase's existing `applications` convention
- `saveProfileFields` / `updateProfileFieldValue` Server Actions, both Zod-validated, both `revalidatePath('/')`
- `ProfileTab` wired as the dashboard's 4th tab: category-grouped list, "+ Agregar campo" popover, per-row pencil-edit popover (NotesPopover-parity autosave), and the "Cargar datos básicos" empty-state bulk-load popover (PROFILE-02's 6 seed fields)
- `page.tsx` conditionally fetches `getAllProfileFields()` only when the Perfil tab is active, skips `FreshnessBadge`/`StaleSyncBanner`/pagination for it (not a GitHub-synced source)

## Task Commits

Each task was committed atomically:

1. **Task 1: profile_fields schema/migration/queries/Server Action/"+ Agregar campo" end-to-end** - `b848597` (feat)
2. **Task 2: Edición inline autosave (TDD)** - `39a0d12` (test, RED) → `1b64c74` (feat, GREEN; no refactor commit needed)
3. **Task 3: Empty state + "Cargar datos básicos"** - `c1c4690` (feat)

_TDD Gate Compliance: Task 2's RED commit (`39a0d12`) confirmed `updateProfileFieldValue is not a function` before implementation; GREEN commit (`1b64c74`) made all 3 behaviors pass. No refactor commit was needed — the GREEN implementation required no cleanup pass._

## Files Created/Modified
- `src/db/schema.ts` - Added `profileFields` EAV table (key UNIQUE, label, value, category, source, timestamps)
- `drizzle/0002_yielding_morgan_stark.sql` - Migration creating `profile_fields`, applied against local dev Postgres
- `src/lib/profile-key.ts` - `normalizeToKey(label)`: NFD-normalize, strip diacritics, snake_case, trim underscores
- `src/db/queries/profile.ts` - `getAllProfileFields`, `upsertProfileField`, `updateProfileFieldValue`
- `src/app/actions/profile.ts` - `saveProfileFields` (batch, per-entry Zod, silent-drop invalid), `updateProfileFieldValue` (single-field autosave)
- `src/components/dashboard/profile-tab.tsx` - `ProfileTab`, `CategoryGroup`, `AddFieldPopover`, `EditFieldPopover`, `BulkLoadPopover`
- `src/app/page.tsx` - 4th `TabsTrigger`/`TabsContent` for "Perfil", conditional `getAllProfileFields()` fetch, `TAB_SYNC_SOURCE` widened to `Partial`
- `scripts/verify-profile.ts` - Ad hoc live-Postgres regression script covering all 3 tasks' behaviors (normalizeToKey, upsert-no-duplicate, update-not-upsert, partial-seed grouping)

## Decisions Made
- `profile_fields.key` is the sole UNIQUE upsert target (never the serial `id`), mirroring `applications.opportunityExternalId` — established codebase convention, no new pattern introduced.
- `normalizeToKey` is the ONLY place a `key` is ever produced; every Server Action in this plan takes `label`/`value`/`category` and derives `key` itself (threat_model T-05-01 — no client-provided key, ever).
- `updateProfileFieldValue` is deliberately NOT an upsert, unlike `upsertProfileField` — an unknown `key` returns `false` and touches nothing, since the pencil-edit popover only ever opens on a row already rendered from a real DB row.
- Spacing tokens for the Perfil tab's category-group stacking used Tailwind's existing default scale (`gap-8`=32px, `mt-6`=24px) rather than new arbitrary-value classes — these already equal the UI-SPEC's `xl`/`2xl` (24px/32px) tokens since the project's `@theme inline` never overrides the default spacing scale, so no new bracket-notation classes were needed to hit the exact pixel values.

## Deviations from Plan

None — plan executed as written. One clarification: the plan's action text suggested Tailwind arbitrary values (`gap-[24px]` style) for the new `xl`/`2xl` spacing tokens; verified against `globals.css`'s `@theme inline` block that Tailwind's default spacing scale is untouched, so the standard `gap-8`/`mt-6` utilities already resolve to the exact same 32px/24px values — not a deviation from the visual spec, just the simpler equivalent implementation.

## Issues Encountered
- No `.env.local` exists in this worktree (gitignored, not copied). Local dev Postgres (`opportunities-dev-db` Docker container on port 5434) was already running; `DATABASE_URL=postgresql://postgres:devpassword@localhost:5434/opportunities` was passed explicitly as an env var prefix to every `drizzle-kit`/`tsx`/`next build`/`next dev` invocation instead of relying on a committed env file.
- `pnpm exec tsc --noEmit` reports one pre-existing, unrelated error (`src/app/layout.tsx(30,50): Cannot find name 'LayoutProps'`) caused by a Next.js-generated type (`.next/types/**`) that only exists after a full `next build` run — confirmed pre-existing via `git stash` (present before any of this plan's changes) and confirmed a red herring since `pnpm build`'s own internal TypeScript pass (which runs after generating those types) completes with zero errors. Out of this plan's scope per the deviation-rules scope boundary (pre-existing, unrelated file).

## Known Stubs

None — every UI affordance in this plan is wired to a real Server Action and real Postgres persistence; no hardcoded/mock data paths were introduced.

## User Setup Required

None - no external service configuration required. The `profile_fields` migration was generated and applied against the existing local dev Postgres instance as part of this plan's execution; the same migration file (`drizzle/0002_yielding_morgan_stark.sql`) needs to be applied to any other environment (staging/prod) via the project's existing `pnpm db:migrate` step, no new secrets or services required.

## Next Phase Readiness
- `profile_fields` (upsert-by-`key`, `source` column already supporting a future `'ai_session'` value) is ready for Phase 6's callback API to write into without any additional migration.
- The sibling plan 05-02 (intermediate tracking statuses on `StatusDropdown`/`application-status.ts`) touches disjoint files and was executing concurrently in a separate worktree — no merge-conflict risk expected between the two plans' file sets.
- Full plan-level automated verification passed clean: `pnpm exec tsc --noEmit` (0 new errors), `pnpm build` (clean), `scripts/verify-profile.ts` (all 9 behaviors PASS against live Postgres, no residue left in the DB).
- Deferred to human_verify_mode: end-of-phase — real browser click-through of the "+ Agregar campo"/"Cargar datos básicos" popovers and the debounced pencil-edit autosave timing (D2-D4 in `coverage`), since this was an autonomous worktree-isolated run without a live browser session. Data-layer and render-layer correctness for all three flows was confirmed via `scripts/verify-profile.ts` and direct HTML inspection of both the empty and populated states.

## Self-Check: PASSED

All 8 created/modified files confirmed present on disk; all 4 task commits
(`b848597`, `39a0d12`, `1b64c74`, `c1c4690`) confirmed present in `git log`.

---
*Phase: 05-perfil-y-etapas-de-tracking*
*Completed: 2026-09-08*
