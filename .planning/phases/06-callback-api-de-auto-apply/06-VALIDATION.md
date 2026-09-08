---
phase: 06-callback-api-de-auto-apply
validated: 2026-09-08
gaps_total: 1
gaps_filled: 1
gaps_escalated: 0
gaps_skipped: 0
status: all_filled
---

# Phase 6: Nyquist Validation Report

**Phase:** 06 — Callback API de Auto-apply
**Validated:** 2026-09-08

## Gap Analyzed

**Gap:** `scripts/verify-apply-session.ts` only exercised sequential calls to
`POST /api/applications/[externalId]/apply-session`. The CR-01 advisory-lock
concurrency fix (06-REVIEW.md blocker, closed in 06-REVIEW-FIX.md) had only
been exercised by a one-off manual `curl` race documented in
06-VERIFICATION.md — not by a permanent, re-runnable automated test. Every
future change to this route (or to `upsertProfileField`) has no regression
guard against silently reintroducing the exact status-regression race the
review flagged.

**Considered:** given this is a personal single-user tool, is a one-off
manual verification enough, or does the automated gap deserve closing?
Decision: close it. The fix here is a security-relevant concurrency
invariant (a race that regresses `applications.status` backward, silently,
under concurrent/retried calls from a semi-trusted LLM-driven caller per this
phase's own threat model) — exactly the kind of thing that's easy to break
accidentally in a future refactor (e.g. someone "simplifies" the transaction,
moves a lock call, or a Drizzle upgrade changes `tx.execute` semantics) and
would be silent (no type error, no lint warning, passes `tsc`/`build` clean)
until re-discovered by hand. A single-user tool still benefits from a cheap,
deterministic regression test for a bug this specific and this easy to
reintroduce unnoticed.

**Classification:** Integration test (real Postgres + real HTTP route,
existing `scripts/verify-*.ts` convention, no test framework in this repo).

## Test Added

Extended `scripts/verify-apply-session.ts`'s `verifyHttpLayer()` with a new
case (8), inserted after the existing collision-atomicity case, before the
function's cleanup `finally` block:

- Forces `applications.status = "ready_to_review"` for the test `externalId`
  directly (bypassing the endpoint, to control the exact starting point).
- Fires two **genuinely concurrent** POSTs via `Promise.all` (no `await`
  between them — same mechanism as the manual race test the verifier ran by
  hand, but now permanent and re-runnable):
  - Request A: `status: "submitted"` (forward from `ready_to_review`, always
    valid regardless of race ordering)
  - Request B: `status: "ready_to_review"` (valid no-op **only if** it reads
    the pre-A state; invalid backward **if** it reads post-A's committed
    `"submitted"` state)
- Asserts A always returns 200, B returns either 200 or 400 (both are
  legitimate depending on which transaction's advisory lock wins), and —
  the load-bearing assertion — **`applications.status` must end up
  `"submitted"` in either case**. If the advisory locks (`pg_advisory_xact_lock`)
  failed to serialize the read-then-write end-to-end, B could read stale data
  before A's commit and still write after A's commit, regressing the status
  back to `"ready_to_review"` — the exact bug CR-01 fixed.

## Verification (test can genuinely fail — proven, not assumed)

1. **Baseline, current implementation:** ran the full script (data layer +
   HTTP layer, including the new race case) against a real `pnpm exec next
   dev` instance and the local dev Postgres, 5 times in a row. All 5 passed
   (`raceA=200`, `raceB` varying 200/400 across runs, `final status=submitted`
   every time).
2. **Adversarial check — temporarily commented out both
   `pg_advisory_xact_lock` calls** in
   `src/app/api/applications/[externalId]/apply-session/route.ts` (verified
   `git status` clean before, reverted via `git checkout --` immediately
   after — no net change to implementation). Re-ran the same script 5 times
   against a freshly restarted dev server: **3 of 5 runs failed** with
   `AssertionError: expected 'submitted', actual 'ready_to_review'` — the
   exact CR-01 regression, caught by the new test.
3. **Restored the implementation** (`git checkout -- "src/app/api/.../route.ts"`),
   confirmed `git status` shows the file unmodified, and reran 5 more times:
   all 5 passed again.

This confirms the test is not trivially-passing scaffolding — it discriminates
between the fixed and broken implementation, non-deterministically catching
the race in 3/5 runs when the lock is absent (races are inherently
non-deterministic; 100% reproducibility isn't expected or required, only that
the failure mode is reachable and caught, which it was).

## Command

```bash
DATABASE_URL=<dev-db-url> AUTO_APPLY_CALLBACK_SECRET=<matching-dev-secret> \
  pnpm exec tsx scripts/verify-apply-session.ts http://localhost:<dev-port>
```

Requires a running `pnpm dev`/`next dev` instance with `AUTO_APPLY_CALLBACK_SECRET`
set to the same value passed to the script — same precondition as Task 2 of
06-01-PLAN.md, no new setup required.

## Result

| Task ID | Requirement | Test Type | File | Command | Status |
|---------|-------------|-----------|------|---------|--------|
| 06-01 (CR-01 concurrency fix) | CALLBACK-02 (server-side validation not trusting the caller, T-06-02) | integration | `scripts/verify-apply-session.ts` (case 8, `verifyHttpLayer`) | `pnpm exec tsx scripts/verify-apply-session.ts <baseUrl>` | green |

## Files for Commit

- `/Users/juan/Documents/Codigo/Personal/opportunities/scripts/verify-apply-session.ts`
- `/Users/juan/Documents/Codigo/Personal/opportunities/.planning/phases/06-callback-api-de-auto-apply/06-VALIDATION.md`

No implementation files were modified (temporary lock-removal during
adversarial verification was reverted via `git checkout --` before this
report was written; `git status` on
`src/app/api/applications/[externalId]/apply-session/route.ts` is clean).
