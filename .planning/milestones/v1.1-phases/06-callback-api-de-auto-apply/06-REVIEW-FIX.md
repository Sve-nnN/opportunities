---
phase: 06-callback-api-de-auto-apply
fixed_at: 2026-09-08T22:35:15Z
review_path: .planning/phases/06-callback-api-de-auto-apply/06-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 6: Code Review Fix Report

**Fixed at:** 2026-09-08T22:35:15Z
**Source review:** .planning/phases/06-callback-api-de-auto-apply/06-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (1 blocker/critical, 3 warnings, 1 info — info included at the requesting agent's explicit direction even though default scope is critical+warning)
- Fixed: 5
- Skipped: 0

## Fixed Issues

### CR-01: Forward-only transition and profile-collision checks are read-then-write races, not closed by "read inside the transaction"

**Files modified:** `src/app/api/applications/[externalId]/apply-session/route.ts`
**Commit:** `e90112f`
**Applied fix:** Added two Postgres advisory transaction locks (`pg_advisory_xact_lock`) as the first statements inside `db.transaction()`, before any read: one keyed by `hashtext(externalId)` to serialize concurrent calls for the same opportunity (closing the status-regression race), and one on a fixed constant (`pg_advisory_xact_lock(0)`) to serialize all apply-session transactions that touch the single shared `profile_fields` table (closing the cross-externalId profile-collision race the review flagged as a secondary concern in the same finding). Both are `_xact_`-scoped and release automatically at COMMIT/ROLLBACK — no manual unlock path needed, so a thrown `CallbackValidationError` still rolls back cleanly.

### WR-01: Bearer-secret comparison is not constant-time

**Files modified:** `src/app/api/applications/[externalId]/apply-session/route.ts`
**Commit:** `70eced8`
**Applied fix:** Added a `safeCompareBearer()` helper using `node:crypto`'s `timingSafeEqual`, replacing the `authHeader !== \`Bearer ${expectedSecret}\`` comparison. Per the requesting agent's explicit scoping, `/api/sync/route.ts`'s equivalent `!==` comparison was deliberately left untouched — out of scope for this phase.

### WR-02: `normalizeToKey` can derive an empty-string profile key from a symbol-only label

**Files modified:** `src/app/api/applications/[externalId]/apply-session/route.ts`
**Commit:** `bb8a8c3`
**Applied fix:** Added an explicit `key.length === 0` check right after deriving `key = normalizeToKey(entry.label)` inside the `profileUpdates` loop, throwing `CallbackValidationError` with a clear message before `upsertProfileField` (and therefore before any DB write) is ever called for that entry.

### WR-03: `CallbackValidationError` doesn't set `this.name`

**Files modified:** `src/app/api/applications/[externalId]/apply-session/route.ts`
**Commit:** `ddfe928`
**Applied fix:** Added an explicit constructor that calls `super(message)` and sets `this.name = "CallbackValidationError"`, so structured logging (`console.error`) prints the actual error class instead of the inherited generic `"Error"`.

### IN-01: Collision error response discloses an existing profile field's label to the calling session

**Files modified:** `src/app/api/applications/[externalId]/apply-session/route.ts`
**Commit:** `db1622f`
**Applied fix:** The 400 response message no longer echoes `existingLabel` — it now reads `profileUpdates label "<label>" collides with an existing profile field`. The specific `existingLabel`/`key` pair is now logged server-side via `console.error` before the `throw`, preserving debuggability without exposing Juan's existing profile data to an externally-callable endpoint. Applied per the requesting agent's direction ("fix it too if it's a one-line change") since it was.

## Skipped Issues

None — all 5 in-scope findings were fixed.

## Verification

All verification below ran in the **main checkout** (`/Users/juan/Documents/Codigo/Personal/opportunities`), not the isolated worktree — Turbopack's `next build` refused to run inside the worktree (`Symlink [project]/node_modules is invalid, it points out of the filesystem root`, since the worktree's `node_modules` was a symlink back to the main checkout's real `node_modules`, which Turbopack treats as escaping its project root). The 5 fix commits were made atomically inside the isolated worktree (branch `gsd-reviewfix/06-23225`, one commit per finding, each individually verified via `npx tsc --noEmit` scoped to the modified file before committing), then fast-forwarded onto `master` via `git merge --ff-only` before running the full-project checks below. This means the numbers below are reproducible from the current `master` HEAD (commit `db1622f`) in this exact tree.

- `npx tsc --noEmit` — clean, no errors.
- `npm run build` (`next build`, Turbopack) — compiled successfully; the new route `/api/applications/[externalId]/apply-session` appears in the route manifest as dynamic (`ƒ`), as expected for a route using `runtime = "nodejs"` and reading `request.json()`/`params`.
- `npx tsx scripts/verify-apply-session.ts http://localhost:3921` — run against local Postgres (`postgresql://postgres:devpassword@127.0.0.1:5434/opportunities`, an existing `opportunities-dev-db` Docker container already running) and a temporary `next dev -p 3921` instance started with a fresh `AUTO_APPLY_CALLBACK_SECRET` generated via `openssl rand -hex 32` for this run only (not committed anywhere, and the temporary dev server was killed immediately after the script finished). All 7 HTTP-contract cases passed: 401 on bad/missing auth, 404 for a nonexistent `externalId`, 400 for an out-of-range status, 400 for a `sentFields` array over the 50-entry cap, the 3-call happy path (accumulating `application_history` rows and learning a new profile field), 400 on a backward transition attempt (state left untouched), and the profile-collision case aborting all three writes (`applications`, `profile_fields`, `application_history`) together. The script's own cleanup restored all touched rows; `git status` on the main checkout shows no changes from the verification run itself.

No logic-bug/human-verification flags: CR-01's fix is a straightforward lock-acquisition-before-read addition (no branching/conditional logic changed), and the 7-case HTTP verification independently exercises the exact concurrency-adjacent state transitions (sequential calls, backward-transition rejection, collision-abort) the fix touches, giving higher confidence than syntax checking alone — though the review's specific "two truly concurrent requests" scenario is not directly exercised by the (sequential) verify script, since `pg_advisory_xact_lock`'s serialization behavior is a well-established Postgres primitive rather than custom logic.

---

_Fixed: 2026-09-08T22:35:15Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
