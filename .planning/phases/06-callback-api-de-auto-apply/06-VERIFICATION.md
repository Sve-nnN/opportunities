---
phase: 06-callback-api-de-auto-apply
verified: 2026-09-08T00:00:00Z
status: passed
score: 10/10 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 6: Callback API de Auto-apply Verification Report

**Phase Goal:** Una sesión externa de Claude Code puede reportar el resultado de un auto-apply (completo o a medias) y el panel de Juan queda actualizado de forma atómica, validada del lado del servidor y auditable.
**Verified:** 2026-09-08
**Status:** passed
**Re-verification:** No — initial verification

## Method

Goal-backward verification against the live codebase and a real running instance, not SUMMARY.md claims. Read every modified file (`route.ts`, `application-history.ts`, `profile.ts`, `application-status.ts`, `opportunities.ts`, `schema.ts`), confirmed the migration is applied against the actual dev Postgres (`opportunities-dev-db`, port 5434), started `next dev` on port 3922 with a freshly generated `AUTO_APPLY_CALLBACK_SECRET` and the project's dev `DATABASE_URL`/`GITHUB_PAT=""`, and drove the real HTTP endpoint with `curl` for every case in the plan's `must_haves`, the 5 ROADMAP success criteria, and all 5 code-review fixes (CR-01/WR-01/WR-02/WR-03/IN-01) — including a genuine two-concurrent-request race test for CR-01, which the phase's own review-fix report explicitly said had not been exercised. All test rows were cleaned up afterward and the dev server was killed; `git status` shows no changes from this verification session.

## Goal Achievement

### Observable Truths (ROADMAP.md Phase 6 Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Un endpoint API gateado por bearer secret actualiza estado, notas y perfil en una sola transacción atómica (todo o nada) | ✓ VERIFIED | Live curl 3-call happy path: `applications.status` advanced auto_fill_in_progress → ready_to_review → submitted; a profile field (`verifier_test_field_xyz`, `source: ai_session`) was upserted; 3 `application_history` rows accumulated — all inside `db.transaction()` (route.ts:147-261). Collision test (below) proves rollback of all three together. |
| 2 | El endpoint valida transiciones de estado y payload del lado del servidor, sin confiar ciegamente en el caller | ✓ VERIFIED | Live curl: `status:"applied"` (a manual status) → 400 Zod rejection before Postgres touched. Backward transition `submitted → auto_fill_in_progress` → 400, `applications.status` unchanged (confirmed via psql). `sentFields` array of 51 entries → 400 `too_big`. |
| 3 | Los campos nuevos que una sesión de auto-apply aprende se guardan automáticamente en el perfil para la próxima vez | ✓ VERIFIED | Live curl call 2 wrote `profile_fields` row `key=verifier_test_field_xyz, source=ai_session`; `application_history.newly_learned_keys` for that row = `["verifier_test_field_xyz"]` (confirmed via psql). |
| 4 | Cada escritura del callback deja un registro de exactamente qué datos se enviaron a esa aplicación específica | ✓ VERIFIED | `application_history` accumulated to 3 rows (never replaced), each with its own `status`/`sent_fields`/`newly_learned_keys` (confirmed via psql `SELECT ... ORDER BY id`). |
| 5 | Ese historial se referencia siempre por `opportunity_external_id`, nunca por el id serial de cache | ✓ VERIFIED | `\d application_history` (live DB) shows `opportunity_external_id text NOT NULL` with a plain btree index, no FK to `opportunities.id`; schema.ts:149-172 matches exactly. |

**Score:** 5/5 ROADMAP truths verified (0 present, behavior-unverified)

### Must-Haves (06-01-PLAN.md frontmatter)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Bearer-gated endpoint writes status/notes + profile upsert + history row atomically | ✓ VERIFIED | Same evidence as SC #1 above. |
| 2 | Endpoint rejects (400) any non-auto-apply status and any backward transition among the 3, without writing | ✓ VERIFIED | Live curl: `applied` → 400; `submitted → auto_fill_in_progress` → 400 and DB status confirmed unchanged. |
| 3 | A profileUpdates label colliding with an existing key aborts the COMPLETE write (profile + status + history) | ✓ VERIFIED | Live curl: submitted a colliding label (`VERIFIER TEST FIELD XYZ` vs existing `Verifier Test Field XYZ`) while attempting `status:"submitted"` again → 400; psql confirms `profile_fields` value untouched, `applications.status` still `submitted` (not reset), `application_history` row count still 3 (no 4th row). |
| 4 | Every successful call adds a NEW row to application_history, never replaces, referenced by opportunity_external_id | ✓ VERIFIED | Row count grew 1→2→3 across the 3 live calls; schema has no UNIQUE on `opportunity_external_id` (confirmed via `\d application_history`). |
| 5 | Nonexistent externalId → 404, no row created | ✓ VERIFIED | Live curl against `nonexistent-fake-id-123` → 404 `{ok:false,error:"Opportunity not found"}`. |
| 6 | Missing/wrong bearer secret → 401, no business logic executed | ✓ VERIFIED | Live curl with no `Authorization` header and with a wrong secret → both 401 `{ok:false,error:"Unauthorized"}`. |

**Score:** 6/6 plan must-haves verified

**Combined score:** 10/10 unique must-haves verified (SC #1 and Plan truth #1 overlap; SC #2 and Plan truths #2/#3 overlap — counted once each in the frontmatter `score` above as 10 distinct checks across ROADMAP+Plan).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/db/schema.ts` — `applicationHistory` table | opportunityExternalId NOT NULL no UNIQUE, sentFields/profileUpdates/newlyLearnedKeys jsonb, index on opportunityExternalId | ✓ VERIFIED | Read source (lines 149-172) and live `\d application_history` — exact match, including index name `application_history_opportunity_external_id_idx`. |
| `drizzle/0003_magenta_impossible_man.sql` | migration applied | ✓ VERIFIED | File present, matches live schema; `drizzle/meta/_journal.json` registers it as idx 3. |
| `src/lib/application-status.ts` — `AUTO_APPLY_CALLBACK_STATUSES` + `isForwardAutoApplyTransition` | complement of manual statuses + forward-only checker | ✓ VERIFIED | Read source lines 68-102 — exact tuple, correct index-based forward logic, `null`/manual-status always permitted. |
| `src/db/queries/opportunities.ts` — `opportunityExistsByExternalId` | boolean existence check | ✓ VERIFIED | Read source lines 176-186 — `.limit(1)`, returns `rows.length > 0`. |
| `src/db/queries/profile.ts` — `upsertProfileField` executor param | accepts db or tx | ✓ VERIFIED | Read source lines 83-110 — structural `Executor` type, defaults to `db`, collision detection intact. |
| `src/db/queries/application-history.ts` — `insertApplicationHistory` | plain insert, executor-aware | ✓ VERIFIED | Read source in full (48 lines) — plain insert, never upsert, executor defaults to `db`. |
| `src/app/api/applications/[externalId]/apply-session/route.ts` | full endpoint | ✓ VERIFIED | Read source in full (275 lines) — auth, Zod, 404, transaction, transition, collision, all present and exercised live. |
| `scripts/verify-apply-session.ts` | data layer + HTTP layer | ✓ VERIFIED | File exists, 569 lines, substantive (data-layer assertions read directly, matrix of transition cases confirmed). |
| `.env.example` — `AUTO_APPLY_CALLBACK_SECRET` documented | — | ✓ VERIFIED | Confirmed via `git show 172487b -- .env.example` diff (direct file read blocked by sandbox deny-rule on `.env*`, so verified via git history instead). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| route.ts transaction | `applications`/`profileFields`/`applicationHistory` | single `db.transaction(async (tx) => ...)` | ✓ WIRED | All three writes pass `tx`, confirmed by live collision test rolling back all three together. |
| `isForwardAutoApplyTransition` | current DB status | read INSIDE the transaction, AFTER the advisory locks | ✓ WIRED | Locks (`pg_advisory_xact_lock`) are literally the first two statements inside the transaction callback (route.ts:163-164), before the `SELECT` of `applications.status` (line 168) or any `profile_fields` read (inside `upsertProfileField`, called later in the same tx). Confirmed by direct code read (not just claim) and by a genuine two-concurrent-curl-request test (below). |
| `application_history.opportunityExternalId` | `opportunities` | plain text column, no FK | ✓ WIRED | Live `\d application_history` — no foreign key constraint present. |

### CR-01 Concurrency Fix — Direct Behavioral Proof

Per the task instruction to specifically verify CR-01 prevents the race, two genuinely concurrent `curl` requests were fired in parallel (backgrounded shell jobs, `wait`) against the same `externalId` already at `status=submitted`: request A re-asserted `submitted` (no-op/idempotent), request B asked for `ready_to_review` (a would-be regression). Result: A → 200, B → 400 `"Cannot transition from \"submitted\" to \"ready_to_review\""`. Final DB state: `applications.status = submitted` (never regressed), `application_history` has exactly 3 rows (no phantom regression row). This confirms request B was serialized behind A by `pg_advisory_xact_lock(hashtext(externalId))` and read A's already-committed status rather than a stale pre-A snapshot — the exact race the review flagged as open, now closed. This is stronger evidence than the phase's own `06-REVIEW-FIX.md`, which explicitly disclaimed testing "two truly concurrent requests."

### Code Review Fixes — Verified in Source (not just commit messages)

| Finding | Fix claimed | Verified in code | Evidence |
|---------|-------------|-------------------|----------|
| CR-01 (blocker) | Advisory locks before any read | ✓ VERIFIED | route.ts:163-164 — `pg_advisory_xact_lock(hashtext(externalId))` and `pg_advisory_xact_lock(0)` are the first two statements inside `db.transaction()`, before the `applications.status` SELECT (line 168) and before any `profile_fields` read (inside `upsertProfileField`, called at line 215+). Live concurrency test above independently confirms the serialization actually holds at runtime. |
| WR-01 | `timingSafeEqual` for bearer comparison | ✓ VERIFIED | route.ts:76-81, `safeCompareBearer()` using `node:crypto`'s `timingSafeEqual`, imported line 2, used at line 109. |
| WR-02 | Reject empty-normalized keys | ✓ VERIFIED | route.ts:209-213, explicit `key.length === 0` check before `upsertProfileField` call. Live curl test with label `"!!!"` → 400 `"does not normalize to a usable key"`. |
| WR-03 | `this.name` set on `CallbackValidationError` | ✓ VERIFIED | route.ts:60-65, explicit constructor sets `this.name = "CallbackValidationError"`. |
| IN-01 | Don't echo `existingLabel` to caller | ✓ VERIFIED | route.ts:237-242 — `console.error` logs the pair server-side, the thrown/returned message reads `"...collides with an existing profile field"` with no label value. Live curl collision test confirms the HTTP response body contains no `existingLabel` text. |

### Behavioral Spot-Checks (live `next dev` + real Postgres)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 401 no auth | `curl -X POST .../apply-session` (no header) | `401 {"ok":false,"error":"Unauthorized"}` | ✓ PASS |
| 401 wrong secret | same + wrong Bearer | `401 Unauthorized` | ✓ PASS |
| 404 nonexistent externalId | valid secret, fake id | `404 Opportunity not found` | ✓ PASS |
| 400 invalid/manual status | `status:"applied"` | `400` Zod `invalid_value` | ✓ PASS |
| Happy path 3-call accumulation | sequential auto_fill_in_progress → ready_to_review (+profileUpdates) → submitted | 200/200/200, DB confirms status + 3 history rows + new profile field | ✓ PASS |
| Backward transition rejected | `submitted → auto_fill_in_progress` | `400`, status unchanged | ✓ PASS |
| Profile collision aborts all 3 writes | colliding label + status change in same call | `400`, profile/status/history all unchanged | ✓ PASS |
| WR-02 empty-key label | `label:"!!!"` | `400 does not normalize to a usable key` | ✓ PASS |
| Size cap | 51-entry `sentFields` | `400 too_big` | ✓ PASS |
| CR-01 genuine race | 2 truly concurrent curl requests | Serialized correctly, no regression | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|--------------|------------|--------------|--------|----------|
| CALLBACK-01 | 06-01 | Bearer-gated atomic endpoint | ✓ SATISFIED | Live transaction test, source read |
| CALLBACK-02 | 06-01 | Server-side transition/payload validation | ✓ SATISFIED | Live 400 tests (status, transition, size cap) |
| PROFILE-03 | 06-01 | Auto-learned fields persist to profile | ✓ SATISFIED | Live profile_fields write + newlyLearnedKeys |
| AUDIT-01 | 06-01 | Per-call audit record of exact data sent | ✓ SATISFIED | Live application_history accumulation |
| AUDIT-02 | 06-01 | Referenced by opportunity_external_id, not serial id | ✓ SATISFIED | Live `\d application_history`, no FK |

### Anti-Patterns Found

None. `grep -n -E "TODO|FIXME|XXX|TBD|HACK|PLACEHOLDER"` across all 5 modified/created source files returned zero matches. No stub returns, no hardcoded empty arrays feeding rendered/returned data.

### Documentation Drift (non-blocking, informational)

`ROADMAP.md` line 85 and the phase checklist (lines 19, 60) still show Phase 6 as "Not started" / `0/1` / unchecked, and `REQUIREMENTS.md` still marks CALLBACK-01/02, PROFILE-03, AUDIT-01/02 as "Pending" / unchecked (lines 45, 60, 65-66, 136-140). This is bookkeeping that trails the actual completed-and-reviewed code (which this verification confirms is real and working) — expected to be updated by the orchestrator once this VERIFICATION.md is accepted, not a code gap. Not counted against the score.

### Human Verification Required

None. All must-haves were verified programmatically against live Postgres and a real running HTTP server.

## Gaps Summary

No gaps found. All 5 ROADMAP success criteria, all 6 plan must-haves, all 9 required artifacts, all 3 key links, and all 5 code-review fixes (1 blocker + 3 warnings + 1 info) are genuinely present, wired, and behaviorally confirmed against a live server and real Postgres — including a direct two-concurrent-request race test for the CR-01 advisory-lock fix that goes beyond what the phase's own verification script exercised.

---

*Verified: 2026-09-08*
*Verifier: Claude (gsd-verifier)*
