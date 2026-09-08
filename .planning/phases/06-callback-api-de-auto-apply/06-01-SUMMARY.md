---
phase: 06-callback-api-de-auto-apply
plan: 01
subsystem: api
tags: [drizzle, postgres, nextjs-route-handler, zod, transaction, bearer-auth]

requires:
  - phase: 05-perfil-y-etapas-de-tracking
    provides: profile_fields EAV table + upsertProfileField collision detection (05-REVIEW.md CR-01), the 3 auto-apply intermediate statuses on applications.status
provides:
  - "application_history table (append-only audit log, indexed on opportunity_external_id)"
  - "POST /api/applications/[externalId]/apply-session — bearer-secret-gated, atomic, server-validated callback endpoint"
  - "AUTO_APPLY_CALLBACK_STATUSES + isForwardAutoApplyTransition() forward-only state machine"
  - "opportunityExistsByExternalId() pre-transaction existence check"
  - "upsertProfileField() executor parameter (db | tx) for transaction participation"
affects: [07-send-to-ai]

actuals:
  tokens: 14900
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Executor-parameterized query functions (db by default, tx when passed) so a query module written for standalone use can also participate in a caller's db.transaction() without duplicating logic"
    - "Structural Executor type derived from Parameters<typeof db.transaction>[0] instead of hand-typed NodePgDatabase/NodePgTransaction generics — stays in sync with the installed drizzle-orm version automatically"

key-files:
  created:
    - src/app/api/applications/[externalId]/apply-session/route.ts
    - src/db/queries/application-history.ts
    - scripts/verify-apply-session.ts
    - drizzle/0003_magenta_impossible_man.sql
  modified:
    - src/db/schema.ts
    - src/lib/application-status.ts
    - src/db/queries/opportunities.ts
    - src/db/queries/profile.ts
    - .env.example

key-decisions:
  - "application_history is append-only (no UNIQUE on opportunity_external_id) — every callback call adds a new row, never replaces the previous one"
  - "upsertProfileField and insertApplicationHistory both take an optional executor param (default db) so the route can pass tx and have all three writes (applications + profile_fields + application_history) share one atomic transaction"
  - "A profile-label collision (05-REVIEW.md CR-01 reused) throws inside the transaction and rolls back the ENTIRE callback write, not just the profile row — stricter than the manual Phase 5 flow, which overwrites and only warns"
  - "isForwardAutoApplyTransition reads currentStatus from inside the open transaction (not before it), closing the check-then-write race window"

patterns-established:
  - "Bearer-secret route pattern (api/sync/route.ts) replicated exactly for a second route, with its own dedicated secret (AUTO_APPLY_CALLBACK_SECRET), never reusing SYNC_TRIGGER_SECRET"

requirements-completed: [CALLBACK-01, CALLBACK-02, PROFILE-03, AUDIT-01, AUDIT-02]

coverage:
  - id: D1
    description: "application_history table + migration: append-only, indexed on opportunity_external_id, never a serial-id FK to opportunities"
    requirement: AUDIT-01
    verification:
      - kind: integration
        ref: "scripts/verify-apply-session.ts#verifyInsertApplicationHistory (data layer) + #verifyHttpLayer case 5 (3-call accumulation, HTTP layer)"
        status: pass
    human_judgment: false
  - id: D2
    description: "AUTO_APPLY_CALLBACK_STATUSES (3-value enum, complement of MANUALLY_SELECTABLE_STATUSES) + isForwardAutoApplyTransition forward-only state machine"
    requirement: CALLBACK-02
    verification:
      - kind: unit
        ref: "scripts/verify-apply-session.ts#verifyIsForwardAutoApplyTransition"
        status: pass
      - kind: integration
        ref: "scripts/verify-apply-session.ts#verifyHttpLayer cases 3 and 6 (invalid status 400, backward transition 400)"
        status: pass
    human_judgment: false
  - id: D3
    description: "opportunityExistsByExternalId 404 pre-transaction check — a URL externalId with no matching opportunity writes nothing"
    requirement: CALLBACK-02
    verification:
      - kind: unit
        ref: "scripts/verify-apply-session.ts#verifyOpportunityExistsByExternalId"
        status: pass
      - kind: integration
        ref: "scripts/verify-apply-session.ts#verifyHttpLayer case 2 (404 for nonexistent externalId)"
        status: pass
    human_judgment: false
  - id: D4
    description: "upsertProfileField(input, executor) participates in the callback's atomic transaction — a collision or later throw rolls back the profile write too"
    requirement: PROFILE-03
    verification:
      - kind: integration
        ref: "scripts/verify-apply-session.ts#verifyUpsertProfileFieldRollsBackInsideTransaction (data layer) + #verifyHttpLayer case 7 (collision aborts profile+status+history together)"
        status: pass
    human_judgment: false
  - id: D5
    description: "POST /api/applications/[externalId]/apply-session: full endpoint — bearer auth (401/500), Zod validation (400), 404, atomic transaction (applications + profile_fields + application_history), forward-only transition enforcement, size caps"
    requirement: CALLBACK-01
    verification:
      - kind: integration
        ref: "scripts/verify-apply-session.ts#verifyHttpLayer cases 1, 3, 4, 5 (auth, status/size validation, 3-call happy path)"
        status: pass
      - kind: other
        ref: "pnpm exec tsc --noEmit && pnpm build (clean, route registered as ƒ /api/applications/[externalId]/apply-session)"
        status: pass
    human_judgment: false

duration: 55min
completed: 2026-09-08
status: complete
---

# Phase 6 Plan 1: Callback API de Auto-apply Summary

**Atomic bearer-secret callback endpoint (`POST /api/applications/[externalId]/apply-session`) that lets an external Claude Code auto-apply session report status + learned profile fields + an audit trail in one all-or-nothing Postgres transaction.**

## Performance

- **Duration:** ~55 min
- **Started:** 2026-09-08T21:19:00Z (approx, context-gathering phase)
- **Completed:** 2026-09-08T22:14:00Z (approx)
- **Tasks:** 2 (both completed, verified against live Postgres and a real `pnpm dev` server)
- **Files modified:** 11

## Accomplishments

- New `application_history` table (Drizzle migration `0003_magenta_impossible_man.sql`, applied against the local dev DB) — append-only, indexed on `opportunity_external_id`, referencing `opportunities` by external id value, never the serial id
- `AUTO_APPLY_CALLBACK_STATUSES` (exact complement of `MANUALLY_SELECTABLE_STATUSES`) + `isForwardAutoApplyTransition()` — a pure, standalone forward-only state machine for the 3 auto-apply statuses
- `opportunityExistsByExternalId()` — the pre-transaction 404 gate
- `upsertProfileField()` extended with an optional `executor` param (defaults to `db`) so it can run inside the callback route's `tx`, reusing the exact 05-REVIEW.md CR-01 collision-detection logic
- New `insertApplicationHistory()` query, same executor pattern, append-only insert
- `POST /api/applications/[externalId]/apply-session`: bearer-secret (`AUTO_APPLY_CALLBACK_SECRET`, never `SYNC_TRIGGER_SECRET`) gated, Zod-validated end to end, one `db.transaction()` writing `applications` + `profile_fields` + `application_history` atomically — a backward status transition or a profile-label collision throws inside the transaction and rolls back all three writes together
- `scripts/verify-apply-session.ts` — data layer (transition matrix, existence check, real transaction rollback, history insert/read-back) plus a full HTTP layer driving the real route against a running dev server: auth, 404, invalid-status 400, oversized-array 400, a 3-call happy path that accumulates history rows and learns a new profile field, backward-transition rejection, and profile-collision atomicity (7 cases, all passing)
- `AUTO_APPLY_CALLBACK_SECRET` documented in `.env.example`

## Task Commits

Both tasks landed in a single commit — Task 2 ("HTTP-layer verification") extends the same file (`scripts/verify-apply-session.ts`) Task 1 already created, and no route/query code needed changes once the HTTP layer was exercised against a real server (it passed on the first run), so there was no second diff to commit.

1. **Task 1: application_history + validación de transición/colisión + endpoint atómico completo** — `172487b` (feat)
2. **Task 2: Verificación HTTP real del contrato completo** — verification-only; same code as `172487b`, executed and confirmed against a live `pnpm dev` server (see "Issues Encountered" for how the precondition was satisfied)

**Plan metadata:** (this commit)

## Files Created/Modified

- `src/db/schema.ts` — added `applicationHistory` table + index
- `src/lib/application-status.ts` — added `AUTO_APPLY_CALLBACK_STATUSES` + `isForwardAutoApplyTransition`
- `src/db/queries/opportunities.ts` — added `opportunityExistsByExternalId`
- `src/db/queries/profile.ts` — `upsertProfileField` now accepts an optional `executor`
- `src/db/queries/application-history.ts` (new) — `insertApplicationHistory`
- `src/app/api/applications/[externalId]/apply-session/route.ts` (new) — the full callback endpoint
- `scripts/verify-apply-session.ts` (new) — data-layer + HTTP-layer verification
- `drizzle/0003_magenta_impossible_man.sql` + `drizzle/meta/*` — migration for `application_history`, applied against local dev Postgres
- `.env.example` — documented `AUTO_APPLY_CALLBACK_SECRET`

## Decisions Made

- `application_history` is deliberately NOT unique on `opportunity_external_id` — matches CONTEXT.md's "una fila nueva por cada llamada," verified by the 3-call happy-path test asserting row count grows 1/2/3, never collapses to 1.
- The `Executor` type in both `profile.ts` and `application-history.ts` is derived structurally (`Parameters<typeof db.transaction>[0]` → `Parameters<TransactionCallback>[0]`) rather than hand-typed against `NodePgDatabase`/`NodePgTransaction` generics, so it can never drift out of sync with the installed `drizzle-orm@0.45.2` API surface.
- `sentFields.key` is accepted from the client (pure audit metadata, per CONTEXT.md) while `profileUpdates` never accepts a client-provided `key` — mirrors the T-05-01 rule from Phase 5's `app/actions/profile.ts`.

## Deviations from Plan

None — plan executed exactly as written. The Task 1/Task 2 split in the plan assumed two separate diffs; in practice writing the full script (data + HTTP layers) in one pass and then running the HTTP layer against a real server produced zero additional code changes, so both tasks share the one commit. This is a process note, not a deviation from `must_haves`/`threat_model` — every truth, artifact, and threat mitigation in the plan was implemented and independently verified.

## Issues Encountered

- Task 2's `<precondition>` (`pnpm dev` running on `:3921` with `AUTO_APPLY_CALLBACK_SECRET` set) was unmet at task start. Per the plan's own `execution_notes` ("generate one with `openssl rand -hex 32` for your own dev/test run... use it only as an env var when running `npm run dev`/your verification script"), I generated a local-only secret via `openssl rand -hex 32`, started `pnpm exec next dev -p 3921` in the background with that secret + the local `DATABASE_URL`, ran the full verification script against it, confirmed zero leftover test rows in Postgres afterward, then killed the dev server. The secret was never committed (only used as a transient env var for this session) and is not the value Juan should use for his real `.env.local`/Dokploy config.

## User Setup Required

**External services require manual configuration.** Per this plan's `user_setup` frontmatter:
- Add `AUTO_APPLY_CALLBACK_SECRET` to `.env.local` for local dev (generate with `openssl rand -hex 32` — do NOT reuse the ephemeral value generated during this execution session, which was never persisted anywhere and is documented here only for audit purposes)
- Add the same variable name (value may differ) to Dokploy's env vars before Phase 7 goes to production, same pattern already in place for `SYNC_TRIGGER_SECRET`

## Next Phase Readiness

- Phase 7 ("Send to AI") can now generate a prompt referencing this endpoint's contract with confidence: the callback is atomic, validated, and independently verified end to end (data layer + real HTTP layer).
- No blockers. The one open item from research/PITFALLS.md Pitfall 3 (bearer-secret leak risk via the prompt hand-off channel) was explicitly accepted as T-06-07 in this plan's threat model for v1.1 scope — Phase 7 should be aware it inherits that accepted risk, not re-litigate it.

---
*Phase: 06-callback-api-de-auto-apply*
*Completed: 2026-09-08*

## Self-Check: PASSED

- FOUND: `src/app/api/applications/[externalId]/apply-session/route.ts`
- FOUND: `src/db/queries/application-history.ts`
- FOUND: `scripts/verify-apply-session.ts`
- FOUND: `drizzle/0003_magenta_impossible_man.sql`
- FOUND: `.planning/phases/06-callback-api-de-auto-apply/06-01-SUMMARY.md`
- FOUND: commit `172487b` in `git log --oneline`
