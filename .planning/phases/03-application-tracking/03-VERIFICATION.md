---
phase: 03-application-tracking
verified: 2026-09-07T00:00:00Z
status: passed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 3: Application Tracking Verification Report

**Phase Goal:** Juan puede trackear el estado real de sus postulaciones desde cualquier dispositivo, sin depender de localStorage
**Verified:** 2026-09-07
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Juan puede marcar el estado de una postulación (por aplicar / aplicado / en proceso / rechazado / aceptado) | ✓ VERIFIED | `src/lib/application-status.ts` defines all 6 values (`saved`, `not_applied`, `applied`, `in_progress`, `rejected`, `accepted`); `StatusDropdown` renders each with icon+text; live write via `scripts/verify-applications.ts` against Postgres 127.0.0.1:5434 passed (upsert-no-duplicate across 6 sequential writes per external_id, readback confirmed) |
| 2 | Juan puede agregar notas libres a una postulación trackeada | ✓ VERIFIED | `NotesPopover` (~500ms debounced autosave, no save button, confirmed by reading `notes-popover.tsx` — writes fire from a `setTimeout` inside `handleChange`, never from a submit/click handler); `scripts/verify-notes.ts` passed live: creates a row on first note, never overwrites a pre-existing different status, repeated writes update the same row (no duplicates) |
| 3 | El estado y las notas persisten en base de datos y se ven igual desde cualquier dispositivo (no localStorage) | ✓ VERIFIED | `grep -rn localStorage src/` returns zero matches anywhere in the app. Direct proof of cross-device sync: wrote `status=accepted, notes="nota de prueba multidispositivo"` to Postgres from an independent script (not through the running app), then curled the already-running production standalone server (`node .next/standalone/server.js`, no restart, no client cache) — the RSC payload for that exact `external_id` rendered the new values verbatim, proving a real server-driven read from Postgres, not client/localStorage state |
| 4 | Juan puede marcar una oportunidad como "guardada/me interesa" sin que cuente como "aplicado" | ✓ VERIFIED | `saved` is a distinct value in the same `status` enum (not the schema's separate `isSaved` boolean); live check via `verify-applications.ts`'s companion checks and code inspection confirms `upsertApplicationStatus(id, "saved")` only ever writes the `status` column — `opportunities.is_active` and `applications.is_saved` are never touched by any write path in `upsertApplicationStatus`/`upsertApplicationNotes` |

**Score:** 4/4 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/db/queries/applications.ts` | `getApplicationsByExternalIds()`, `upsertApplicationStatus()`, `upsertApplicationNotes()` | ✓ VERIFIED | Single `inArray` query (no N+1), `onConflictDoUpdate` targeting `opportunity_external_id` UNIQUE constraint, notes upsert never overwrites status |
| `src/app/actions/applications.ts` | Zod-validated Server Actions | ✓ VERIFIED | `updateApplicationStatus`/`updateApplicationNotes`, both validate untrusted client input (6-value enum, 2000-char cap) before touching the DB, both `revalidatePath` |
| `src/components/dashboard/status-dropdown.tsx` | icon+text status control | ✓ VERIFIED | All 6 states, icon+text pairing (DESIGN.md compliance), defensive re-focus fix for a real focus-loss bug found during a11y testing |
| `src/components/dashboard/notes-popover.tsx` | debounced autosave notes | ✓ VERIFIED | 500ms debounce, fill/outline icon distinguishes has-note vs empty, no save button |
| `src/components/dashboard/virtualized-opportunities-table.tsx` | row virtualization | ✓ VERIFIED | `@tanstack/react-virtual`, real semantic `<table>`, roving tabindex, spacer-row technique (deviated from literal plan wording for a documented, measured reason) |
| `drizzle/0001_wild_iron_lad.sql` | UNIQUE constraint on `opportunity_external_id` | ✓ VERIFIED | Migration exists and applied against live dev Postgres; confirmed schema + upsert logic depend on it correctly |
| `src/db/schema.ts` applications table | references opportunities by `external_id`, never serial `id` | ✓ VERIFIED | `opportunityExternalId: text(...).notNull().unique()` — no foreign key to `opportunities.id` anywhere in the schema or query layer |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `StatusDropdown` (client) | `updateApplicationStatus` (Server Action) | `onValueChange` → `startTransition` | ✓ WIRED | Confirmed in code and via live Playwright keyboard walkthrough (Enter/arrows select an option, write reaches Postgres) |
| `NotesPopover` (client) | `updateApplicationNotes` (Server Action) | debounced `setTimeout` → `startTransition` | ✓ WIRED | Confirmed live: typed text in the running standalone server's popover triggers `upsertApplicationNotes`, `verify-notes.ts` passed against live DB |
| `page.tsx` | `getApplicationsByExternalIds` | `await` before render, passed as `applicationsByExternalId` prop | ✓ WIRED | Single query covering both Internships/Underclassmen `externalId`s, no N+1 |
| `VirtualizedOpportunitiesTable` | `StatusDropdown`/`NotesPopover` | per-row `record?.status`, `record?.notes` props | ✓ WIRED | Untracked rows correctly default to `not_applied`/`null` via `?? "not_applied"` fallback |

### Data-Flow Trace

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `page.tsx` `applicationsByExternalId` | `Map<string, ApplicationRecord>` | `getApplicationsByExternalIds()` → live Postgres `SELECT ... WHERE opportunity_external_id IN (...)` | Yes | ✓ FLOWING |
| `StatusDropdown` displayed status | `record?.status` | Real DB row via the Map above | Yes | ✓ FLOWING |
| `NotesPopover` displayed notes | `record?.notes` | Real DB row via the Map above | Yes | ✓ FLOWING |

### Behavioral Spot-Checks / Live Verification

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `pnpm exec tsc --noEmit` | clean run | 0 errors | ✓ PASS |
| `pnpm build` | clean run | Compiled successfully, all routes generated | ✓ PASS |
| `scripts/verify-applications.ts` against live Postgres | upsert-no-duplicate, Map readback, untracked-absence | All 3 assertions passed | ✓ PASS |
| `scripts/verify-notes.ts` against live Postgres | create/never-overwrite-status/no-duplicate/Map-exposure | All 4 assertions passed | ✓ PASS |
| `scripts/verify-a11y.ts` against a real running production standalone server (`node .next/standalone/server.js`, with `.next/static` and `public` correctly copied in — this verifier's own fix; the original standalone build lacked them and the check timed out until corrected) | tablist reachability, mounted-row count, roving tabindex, full keyboard walkthrough of StatusDropdown + NotesPopover | Tablist reachable in **1,324ms** (was 6,000–13,000ms pre-virtualization, per 02-03-SUMMARY.md); **27** mounted `<tr>` (was 16,109+); roving tabindex `.focus()→0, ArrowDown→1, End→16110, Home→0`; StatusDropdown operable via arrows+Enter with no focus loss; NotesPopover operable via Enter/Escape with no focus loss | ✓ PASS — independently confirms the claimed before/after numbers in 03-02-SUMMARY.md |
| Cross-device persistence | Wrote `status`/`notes` to Postgres from an independent script while the production server was already running (no restart); curled the server fresh | RSC payload for the modified `external_id` reflected the new values verbatim | ✓ PASS |
| Visual DESIGN.md compliance (StatusDropdown, NotesPopover) | Playwright screenshots of both open popovers | Flat surfaces, hairline borders, no visible box-shadow, icon+text pairing on every status option — resolves the human-judgment item flagged in both SUMMARYs | ✓ PASS (verified directly, not deferred to human) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| TRACK-01 | Plan 1 | Marcar estado de postulación | ✓ SATISFIED | Live upsert/readback verified |
| TRACK-02 | Plan 2 | Notas libres | ✓ SATISFIED | Live upsert/readback verified, debounced autosave confirmed in code |
| TRACK-03 | Plan 1 (status) / Plan 2 (notas) | Persistencia en DB, igual desde cualquier dispositivo, no localStorage | ✓ SATISFIED | No localStorage usage anywhere in `src/`; cross-device simulation (independent write + fresh server read) confirmed identical state |
| TRACK-04 | Plan 1 | "Guardado/me interesa" distinto de "aplicado" | ✓ SATISFIED | `saved` is a sibling enum value, never touches `is_active`/`is_saved` |

No orphaned requirements — TRACK-01 through TRACK-04 are the full Phase 3 requirement set and all are mapped to plans and verified.

### Anti-Patterns Found

None. Grep for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER|coming soon|not yet implemented` across all Phase 3 files (`applications.ts` queries/actions, `status-dropdown.tsx`, `notes-popover.tsx`, `virtualized-opportunities-table.tsx`) returned zero matches.

### Human Verification Required

None. The one item both SUMMARYs flagged as `human_judgment: true` (whether StatusDropdown/NotesPopover visually read as native to DESIGN.md's system) was resolved directly by this verifier via Playwright screenshots against the live running app — both surfaces are flat, hairline-bordered, with no shadow and full icon+text state pairing, matching DESIGN.md's Flat-By-Default and Never-Color-Alone rules.

### Gaps Summary

No gaps. All 4 phase success criteria hold under live-Postgres and live-browser verification (not just SUMMARY.md prose):

- Status marking and notes both persist to Postgres and were proven to sync across a simulated second "device" (an independent write process + a fresh, already-running server read, no client cache/localStorage involved).
- `applications.opportunity_external_id` is a real UNIQUE-constrained text column, never a foreign key to `opportunities.id`/`benefits.id` — the anti-pattern from research/ARCHITECTURE.md Anti-Pattern 2 is genuinely avoided.
- The claimed row-virtualization fix for the Phase 2 keyboard-reachability regression was independently reproduced: 1,324ms tablist-reachable (vs. the documented 6,000–13,000ms) and 27 mounted rows (vs. 16,109+), both measured live against a real production build, not asserted from prose.
- `pnpm exec tsc --noEmit` and `pnpm build` both run clean.

One environment note for future verifiers: the standalone Next.js build (`.next/standalone/`) does not include `.next/static/` or `public/` by default — these must be copied in manually before running `node .next/standalone/server.js`, or all client JS/CSS 404s and the app never hydrates. This is a deployment-config detail Phase 4 (Dokploy) will need to handle via its own Dockerfile `COPY` steps, not a defect in this phase's code.

---

*Verified: 2026-09-07*
*Verifier: Claude (gsd-verifier)*
