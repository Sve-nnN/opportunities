---
phase: 05-perfil-y-etapas-de-tracking
plan: 02
subsystem: ui
tags: [zod, server-actions, radix-select, lucide-react, playwright, application-tracking]

# Dependency graph
requires:
  - phase: 03-application-tracking
    provides: "APPLICATION_STATUSES enum, StatusDropdown/status-dropdown.tsx, updateApplicationStatus Server Action, T-03-01 Zod-enum mitigation pattern"
provides:
  - "APPLICATION_STATUSES extended to 9 values (3 new read-only auto-apply intermediate states)"
  - "MANUALLY_SELECTABLE_STATUSES (6 values) as the single source of truth for what StatusDropdown lets Juan pick by hand"
  - "statusSchema server-side allowlist restricted to MANUALLY_SELECTABLE_STATUSES (T-05-04 defense in depth)"
  - "StatusDropdown STATUS_META + SelectContent + violet-tint trigger background for the 3 new states"
  - "scripts/verify-status-extension.ts (data layer + real-browser Playwright checks)"
affects: [06-callback-api, 07-send-to-ai]

# Actuals (#2632)
actuals:
  tokens: 4898
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "MANUALLY_SELECTABLE_STATUSES as a second, narrower array alongside the full enum — SelectContent iterates the narrow one, STATUS_META/SelectValue still key off the full one, so a non-selectable current value renders correctly with zero structural change"
    - "Server-side Zod schema scoped to the narrow allowlist (not the full enum) as defense-in-depth beyond UI hiding, extending the existing T-03-01 pattern"
    - "Playwright browser checks resolve the externalId to test from the actually-mounted DOM row (not a random DB row), since VirtualizedOpportunitiesTable only mounts the visible+overscan window"

key-files:
  created:
    - scripts/verify-status-extension.ts
  modified:
    - src/lib/application-status.ts
    - src/app/actions/applications.ts
    - src/components/dashboard/status-dropdown.tsx

key-decisions:
  - "Honored 05-CONTEXT.md/05-UI-SPEC.md's explicit 'read-only in the dropdown' decision over ROADMAP.md's looser 'muestra y permite seleccionar' wording, per the plan's own documented resolution"
  - "Reused the existing --accent/--accent-foreground tokens (#1e1930/#e7e5e1) for the violet-tint trigger background instead of introducing a new CSS variable, since they already match the UI-SPEC's exact hex values"

patterns-established:
  - "A 'manually selectable subset' array pattern for any future status-like enum that needs some values to be system-only"

requirements-completed: [TRACK-05, TRACK-06]

coverage:
  - id: D1
    description: "applications.status column accepts the 3 new auto-apply values (auto_fill_in_progress, ready_to_review, submitted) with no DB migration"
    requirement: TRACK-05
    verification:
      - kind: integration
        ref: "scripts/verify-status-extension.ts (data layer: upsertApplicationStatus + getApplicationsByExternalIds round-trip against live Postgres)"
        status: pass
    human_judgment: false
  - id: D2
    description: "StatusDropdown never offers the 3 new states as a selectable SelectItem, and updateApplicationStatus rejects them server-side even from a modified client"
    requirement: TRACK-06
    verification:
      - kind: integration
        ref: "scripts/verify-status-extension.ts (data layer: MANUALLY_SELECTABLE_STATUSES shape assertions)"
        status: pass
      - kind: automated_ui
        ref: "scripts/verify-status-extension.ts (browser layer: opens SelectContent, asserts exactly 6 role=option elements, none matching the 3 auto labels)"
        status: pass
    human_judgment: false
  - id: D3
    description: "A row already set to an auto-apply status renders with its own icon, Spanish label, and violet-tint (#1e1930) trigger background"
    requirement: TRACK-06
    verification:
      - kind: automated_ui
        ref: "scripts/verify-status-extension.ts (browser layer: getComputedStyle + canvas-resolved background color check against #1e1930, innerText match against 'Enviado (auto-apply)')"
        status: pass
    human_judgment: false

duration: ~20min
completed: 2026-09-08
status: complete
---

# Phase 5 Plan 2: Etapas de Tracking (Auto-Apply Status Extension) Summary

**Extended `APPLICATION_STATUSES` to 9 values with 3 read-only auto-apply intermediate states, restricted `StatusDropdown`'s selectable options and `updateApplicationStatus`'s Zod schema to the original 6, and added a violet-tint trigger background so an auto-set status is visually distinguishable from a hand-picked one — no DB migration required.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments
- `APPLICATION_STATUSES` (9 values) and new `MANUALLY_SELECTABLE_STATUSES` (6 values, the original set) exported from `src/lib/application-status.ts`
- `updateApplicationStatus`'s Zod `statusSchema` restricted to `MANUALLY_SELECTABLE_STATUSES` — a modified client POSTing `auto_fill_in_progress`/`ready_to_review`/`submitted` is rejected before it reaches Postgres (T-05-04)
- `StatusDropdown`'s `STATUS_META` extended with `Hourglass`/`Eye`/`CircleCheck` icons and Spanish labels for the 3 new states; `SelectContent` now iterates `MANUALLY_SELECTABLE_STATUSES` (never offering the 3 new states as an option), while `SelectValue` still renders any of the 9 correctly since it reads `STATUS_META` directly
- `SelectTrigger` gets a `bg-accent text-accent-foreground` (`#1e1930`/`#e7e5e1`) background exactly when the current status is one of the 3 auto states — no new color token introduced
- `scripts/verify-status-extension.ts` created: data-layer checks (shape assertions + write/read-back against live Postgres) always run; a browser layer (Playwright, real dev server) runs when a `baseUrl` argument is given, confirming both the visual tint/label and that the Select truly exposes only 6 options

## Task Commits

Each task was committed atomically:

1. **Task 1: Extender APPLICATION_STATUSES + STATUS_META + restricción de selección manual** - `e2f1e90` (feat)
2. **Task 2: Verificación real en navegador — estados nuevos no seleccionables, tinte violeta visible** - `04a8b6f` (test)

**Plan metadata:** committed separately by the orchestrator (this plan does not update STATE.md/ROADMAP.md per its execution charter — sibling plan 05-01 completes concurrently).

## Files Created/Modified
- `src/lib/application-status.ts` - Added `auto_fill_in_progress`/`ready_to_review`/`submitted` to `APPLICATION_STATUSES` (9 values); added `MANUALLY_SELECTABLE_STATUSES` (6 values) as the new source of truth for pickable options
- `src/app/actions/applications.ts` - `statusSchema` now validates against `MANUALLY_SELECTABLE_STATUSES` instead of the full `APPLICATION_STATUSES` enum
- `src/components/dashboard/status-dropdown.tsx` - `STATUS_META` extended with the 3 new entries; `SelectContent` loop switched to `MANUALLY_SELECTABLE_STATUSES`; `SelectTrigger` gets a conditional violet-tint background for the 3 auto states
- `scripts/verify-status-extension.ts` (new) - Data-layer + Playwright browser verification script for this plan's must-haves

## Decisions Made
- Followed 05-CONTEXT.md/05-UI-SPEC.md's explicit "read-only in the dropdown" instruction over ROADMAP.md's looser wording, as the plan itself documents — this is not a new decision made during execution, just confirmed and implemented as specified
- Reused the existing `--accent`/`--accent-foreground` CSS variables (already `#1e1930`/`#e7e5e1` in `globals.css`) for the violet-tint background rather than adding a new token, since they matched the UI-SPEC's exact values verbatim (confirmed via `grep` before implementing)
- For the browser verification, resolved the externalId to test from the DOM's first actually-mounted row rather than an arbitrary DB row via `LIMIT 1`, since `VirtualizedOpportunitiesTable` only mounts the visible+overscan window — a randomly-picked DB row is very likely off-screen and would never appear in the DOM to assert against

## Deviations from Plan

None - plan executed exactly as written. `scripts/verify-status-extension.ts` was built up incrementally (data-layer-only in Task 1's commit, browser layer added in Task 2's commit) matching the plan's own task-by-task file evolution.

## Issues Encountered
- No `.env.local` existed in this worktree (gitignored, not copied from the main checkout) and no dev server was running on port 3921 — both needed for `pnpm build` and the browser-layer verification. Resolved by exporting `DATABASE_URL` inline per command (pointing at the existing local dev Postgres container on port 5434, same connection string already documented in `scripts/verify-applications.ts`'s own header comment) and starting `next dev -p 3921` in the background for the duration of Task 2's verification, then killing it afterward. No code or plan-scope impact.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `APPLICATION_STATUSES`/`MANUALLY_SELECTABLE_STATUSES` and `StatusDropdown`'s visual handling of the 3 auto states are ready for Phase 6's callback API to actually set `auto_fill_in_progress`/`ready_to_review`/`submitted` on real rows — no further schema or UI work needed on this side
- Sibling plan 05-01 (profile data) touches disjoint files (`profile_fields` schema/queries/actions/`ProfileTab`) and is expected to merge cleanly with this plan's changes

---
*Phase: 05-perfil-y-etapas-de-tracking*
*Completed: 2026-09-08*

## Self-Check: PASSED

All created/modified files and both task commit hashes (`e2f1e90`, `04a8b6f`) confirmed present.
