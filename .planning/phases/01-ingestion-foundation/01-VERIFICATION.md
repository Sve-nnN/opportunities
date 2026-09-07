---
phase: 01-ingestion-foundation
verified: 2026-09-07T23:15:00Z
status: passed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 1: Ingestion Foundation Verification Report

**Phase Goal:** Los datos de las 3 fuentes de GitHub existen normalizados y actualizados en Postgres, sin depender de fetch-por-request
**Verified:** 2026-09-07T23:15:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Los datos de las 3 fuentes están normalizados en un esquema común dentro de Postgres | ✓ VERIFIED | Live query against `postgres://127.0.0.1:5434/opportunities`: `opportunities` table holds `summer2027-internships` (16,109 rows: 3,083 active / 13,026 inactive) and `underclassmen-opportunities` (109 active) sharing one schema (`src/db/schema.ts:19-41`); `benefits` table holds `student-benefits` (42 active, `src/db/schema.ts:47-66`). All 3 sources go through a shared `NormalizedOpportunity`/`NormalizedBenefit` shape in `src/ingestion/normalize.ts`. |
| 2 | Sync programado + reintento manual, sin fetch-por-request | ✓ VERIFIED | `src/instrumentation.ts` calls `startScheduledSync()` once at server boot (Next.js `register()` hook, not per-request); `src/jobs/scheduled-sync.ts` registers a `node-cron` job (`0 */2 * * *`) guarded by a `started` flag so it can never re-register per request. `POST /api/sync` (`src/app/api/sync/route.ts`) is secret-gated and calls the identical `runSync()`. Grepped `src/app` for `fetch(` outside `api/sync`/ingestion code — none found; `src/app/page.tsx` has no data fetch (Discovery UI is Phase 2, out of scope here). |
| 3 | `external_id` estable que sobrevive syncs | ✓ VERIFIED | DB-level `UNIQUE` constraints confirmed via `pg_constraint` (`opportunities_external_id_unique`, `benefits_external_id_unique`) — uniqueness is enforced by Postgres itself, not just app logic. Live counts: 16,218/16,218 distinct `external_id` in `opportunities`, 42/42 in `benefits`, zero duplicate groups. `sync_log` shows repeated syncs of the same source producing the same row counts with `rows_soft_deleted: 0` across consecutive runs, confirming ids are stable (re-upserted, not re-created) across syncs. |
| 4 | Registros que desaparecen quedan inactivos, nunca se borran | ✓ VERIFIED | Live behavioral test: ran the exact soft-delete SQL pattern used by `upsertOpportunities()` (`src/db/queries/upsert.ts:138-148`) against a real row, simulating its disappearance from source. Result: row flipped to `is_active=false`, total row count for that source unchanged (109 before and after — no hard delete), row confirmed still present via `SELECT`, then restored. Soft-delete is also correctly scoped per-`source` in the `WHERE` clause, preventing cross-source soft-delete (per 01-02-SUMMARY.md D4, independently re-verified here). |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/db/schema.ts` | 4-table Drizzle schema (opportunities, benefits, applications, sync_log) | ✓ VERIFIED | All 4 tables present, `external_id` unique+notNull on opportunities/benefits |
| `src/ingestion/sources/student-benefits.ts` | Fetch + zod validation for student-benefits | ✓ VERIFIED | PAT-aware fetch, real field name `requiresCampus` matched |
| `src/ingestion/sources/summer-internships.ts` | Fetch + zod validation for listings.json | ✓ VERIFIED | dev→main branch fallback, `.passthrough()` schema |
| `src/ingestion/sources/underclassmen.ts` | GFM markdown parser | ✓ VERIFIED | present, used by `sync.ts` |
| `src/ingestion/normalize.ts` | Shared normalization + external_id hashing | ✓ VERIFIED | 3 normalize functions, sha1-based ids |
| `src/ingestion/sync.ts` | `runSync()` orchestrator | ✓ VERIFIED | Promise.allSettled across 3 sources, per-source try/catch |
| `src/db/queries/upsert.ts` | Upsert + scoped soft-delete | ✓ VERIFIED | `onConflictDoUpdate` + `notInArray` soft-delete, source-scoped for opportunities |
| `src/db/queries/sync-log.ts` | sync_log start/finish helpers | ✓ VERIFIED | present, wired into all 3 sync* functions |
| `src/jobs/scheduled-sync.ts` | Cron registration | ✓ VERIFIED | `node-cron`, single-registration guard |
| `src/instrumentation.ts` | Server-startup hook | ✓ VERIFIED | Next.js `register()`, calls `startScheduledSync()` |
| `src/app/api/sync/route.ts` | Manual trigger route | ✓ VERIFIED | Secret-gated POST, Node runtime, calls `runSync()` |
| `Dockerfile` | Standalone Docker build | ✓ VERIFIED | present at repo root (not re-verified line-by-line, out of Phase 1's Postgres-focused goal) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `src/instrumentation.ts` | `src/jobs/scheduled-sync.ts` | `startScheduledSync()` import | WIRED | Confirmed by source read |
| `src/jobs/scheduled-sync.ts` | `src/ingestion/sync.ts` | `runSync()` import | WIRED | Same function used by cron and API route |
| `src/app/api/sync/route.ts` | `src/ingestion/sync.ts` | `runSync()` import | WIRED | Identical entrypoint, no duplicated logic |
| `src/ingestion/sync.ts` | `src/db/queries/upsert.ts` | `upsertBenefits`/`upsertOpportunities` | WIRED | Confirmed by source read |
| `src/ingestion/sync.ts` | `src/db/queries/sync-log.ts` | `startSyncLog`/`finishSyncLog` | WIRED | `sync_log` table has real rows matching this pattern |
| `src/db/queries/upsert.ts` | Postgres | Drizzle `db.insert()/.update()` | FLOWING | Live query confirms real rows (16,218 + 42) match sync_log's `rows_upserted` counts |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `opportunities` table | rows | Live GitHub raw content via `runSync()` | Yes — 16,218 real rows, verified against `sync_log` counts | ✓ FLOWING |
| `benefits` table | rows | Live GitHub raw content via `runSync()` | Yes — 42 real rows | ✓ FLOWING |
| `sync_log` table | rows | `startSyncLog`/`finishSyncLog` | Yes — 10 real historical runs inspected, timestamps/counts/errors consistent with actual data state | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| No fetch-per-request in app routes | `grep -rn "fetch(" src/app \| grep -v api/sync` | No matches outside ingestion/api-sync code | ✓ PASS |
| Cron registered once, not per-request | Read `src/jobs/scheduled-sync.ts` `started` guard + `src/instrumentation.ts` boot-only hook | Guard present, hook is Next's `register()` (boot-time only) | ✓ PASS |
| external_id DB-level uniqueness | `pg_constraint` query | `opportunities_external_id_unique`, `benefits_external_id_unique` both `contype: u` | ✓ PASS |
| Soft-delete never hard-deletes | Live simulated soft-delete SQL against real Postgres row | Row count unchanged, row still queryable with `is_active=false`, then restored | ✓ PASS |
| `pnpm build` | `pnpm build` | Compiled successfully, all routes built (`/`, `/_not-found`, `/api/sync`) | ✓ PASS |
| `tsc --noEmit` | `pnpm exec tsc --noEmit` (after `pnpm build` generated `.next/types`) | No errors | ✓ PASS |

Note: a standalone `tsc --noEmit` run *before* any `pnpm build`/`pnpm dev` fails with `Cannot find name 'LayoutProps'` in `src/app/layout.tsx`. This is a known Next.js 16 typed-routes artifact — `LayoutProps<"/">` is an ambient type generated into `.next/types/routes.d.ts`, which `tsconfig.json` already includes but which does not exist until a build/dev run has happened at least once. `pnpm build` itself runs its own internal type-check and passes cleanly, and `node_modules`/`.next` were not present in this checkout until this verification ran `pnpm install` + `pnpm build`. Not a code defect — no gap raised for it.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ING-01 | 01-02 | Summer2027-Internships via listings.json | ✓ SATISFIED | `src/ingestion/sources/summer-internships.ts`, 16,109 live rows in DB |
| ING-02 | 01-02 | underclassmen-opportunities via real GFM parser | ✓ SATISFIED | `src/ingestion/sources/underclassmen.ts` (remark-gfm), 109 live rows in DB |
| ING-03 | 01-01 | student-benefits/benefits.json normalized | ✓ SATISFIED | `src/ingestion/sources/student-benefits.ts`, 42 live rows in DB |
| ING-04 | 01-01/01-02 | Scheduled job (not per-request) + manual retry | ✓ SATISFIED | `src/jobs/scheduled-sync.ts` (cron) + `src/app/api/sync/route.ts` (manual), same `runSync()` |
| ING-05 | 01-01/01-02 | Stable, non-autoincremental external_id | ✓ SATISFIED | sha1-hash based ids in `normalize.ts`, DB-level UNIQUE constraint, 0 duplicates live |
| ING-06 | 01-01/01-02 | Soft-delete, never hard-delete | ✓ SATISFIED | `upsert.ts` soft-delete pattern, live-tested against real Postgres row |

### Anti-Patterns Found

None. Grepped all `src/` files for `TODO|FIXME|HACK|XXX|TBD|placeholder|not yet implemented|not available` — zero matches.

### Human Verification Required

None. All must-haves are verified programmatically against the live codebase and a live Postgres instance with real data.

### Gaps Summary

No gaps. All 4 roadmap success criteria and all 6 requirements (ING-01 through ING-06) are backed by live, queryable evidence in the running Postgres instance and the source code — not just SUMMARY.md claims. `pnpm build` and `tsc --noEmit` both pass cleanly. One environment note: `node_modules` did not exist in this checkout at verification start; `pnpm install` was run to enable `pnpm build`/`tsc`/live DB scripts, with no code changes.

---

*Verified: 2026-09-07T23:15:00Z*
*Verifier: Claude (gsd-verifier)*
