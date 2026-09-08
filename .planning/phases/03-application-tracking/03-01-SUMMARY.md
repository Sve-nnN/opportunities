---
phase: 03-application-tracking
plan: 01
subsystem: database
tags: [drizzle, postgres, nextjs-server-actions, radix-select, zod, a11y]

requires:
  - phase: 01-ingestion-foundation
    provides: "applications table (schema-only), stable external_id on opportunities (research/ARCHITECTURE.md Anti-Pattern 2)"
  - phase: 02-discovery-ui
    provides: "page.tsx 3-tab dashboard, OpportunitiesTable, DESIGN.md locked visual system"
provides:
  - "getApplicationsByExternalIds()/upsertApplicationStatus() (src/db/queries/applications.ts) — single-query in-memory join + upsert-by-external_id, never the opportunities cache table's serial id"
  - "updateApplicationStatus Server Action (src/app/actions/applications.ts) — Zod-validated status enum, revalidatePath"
  - "StatusDropdown (src/components/dashboard/status-dropdown.tsx) — icon+text inline status control, wired into Internships/Underclassmen 'Postulación' column"
  - "src/lib/application-status.ts — the 6-value ApplicationStatus enum, importable from client components without pulling the Postgres driver into the browser bundle"
  - "applications.opportunity_external_id UNIQUE constraint (drizzle/0001_wild_iron_lad.sql)"
affects: [phase-3-application-tracking-plan-2, phase-4-deploy]

actuals:
  tokens: 9710
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Client components must never import from a module that transitively imports @/db/client (pg) — even a type-only-looking import of a const array pulls the whole module graph into the browser bundle and breaks `next build` with 'Module not found: tls/util/types'. Shared enums/types consumed by both server queries and client components live in src/lib/ (no db import), never in src/db/queries/."
    - "Upsert-by-external_id requires a real UNIQUE constraint for onConflictDoUpdate to target — a schema-only text column with no constraint compiles fine in Drizzle's TS types but fails at the DB level; added via a dedicated migration before writing the upsert function."
    - "shadcn-generated primitives are a starting point, not a locked contract — SelectContent's default shadow-md violated DESIGN.md's Flat-By-Default Rule and was fixed at generation time, same as Phase 2's input.tsx/button.tsx focus-ring fixes."

key-files:
  created:
    - src/db/queries/applications.ts
    - src/app/actions/applications.ts
    - src/components/dashboard/status-dropdown.tsx
    - src/components/ui/select.tsx
    - src/lib/application-status.ts
    - drizzle/0001_wild_iron_lad.sql
    - scripts/verify-applications.ts
  modified:
    - src/app/page.tsx
    - src/db/schema.ts

key-decisions:
  - "opportunityExternalId marked .unique() in schema.ts and a migration generated/applied against live dev Postgres — required for onConflictDoUpdate to have a real ON CONFLICT target; table was empty so the migration was lossless."
  - "'Guardado / me interesa' implemented as a 6th value of the same status text column (saved/not_applied/applied/in_progress/rejected/accepted), not via the schema's pre-existing isSaved boolean — confirmed live that setting status='saved' never touches opportunities.is_active or applications.is_saved (TRACK-04)."
  - "ApplicationStatus/APPLICATION_STATUSES moved to src/lib/application-status.ts (no pg import) after the first pnpm build failed — StatusDropdown (client) had imported them from db/queries/applications.ts, which imports db/client.ts (pg), breaking the client bundle with Node-only module errors (tls, util/types)."
  - "Removed shadcn select.tsx's default shadow-md, replaced with border-border — DESIGN.md's Flat-By-Default Rule forbids any box-shadow anywhere in this system."
  - "getApplicationsByExternalIds() is called once per page render, after internships/underclassmen resolve (not inside the same Promise.all, since it needs their externalIds) — one extra round trip, not an N+1 per row, and Benefits is excluded since TRACK-01/04 only cover opportunities."
  - "Could not write .env.local in this worktree — sandbox permission rules deny reading/writing any .env* path. Verified against live Postgres by passing DATABASE_URL inline per command instead (drizzle.config.ts only falls back to .env.local when DATABASE_URL isn't already set in process.env, so this is equivalent for local verification); production deploys already set DATABASE_URL directly via Dokploy env vars per STACK.md, unaffected by this workaround."

requirements-completed: [TRACK-01, TRACK-04]

coverage:
  - id: D1
    description: "Juan can change a row's application status from an inline icon+text dropdown on Internships/Underclassmen, and the new value survives a page reload (persisted in Postgres keyed by opportunity_external_id, never the cache table's serial id)"
    requirement: "TRACK-01"
    verification:
      - kind: integration
        ref: "scripts/verify-applications.ts against live Postgres (127.0.0.1:5434): 3 real external_ids, 6 sequential status writes each, confirms 1 row per external_id (no duplicates) and getApplicationsByExternalIds reads back the last-written value"
        status: pass
      - kind: e2e
        ref: "Manual tsx script called upsertApplicationStatus('64fd71e70a138230a726870730da0a104c47b6e8', 'saved') against live dev Postgres, then curled the production standalone build (node .next/standalone/server.js) fresh (no cache) and confirmed the RSC payload for that exact row rendered StatusDropdown with status:\"saved\" — a real full page re-render read the persisted value back, not a client-only optimistic state"
        status: pass
    human_judgment: false
  - id: D2
    description: "Choosing 'Guardado / me interesa' is a distinct status value in the same column — it never flips opportunities.is_active or applications.is_saved, and is never counted as 'applied' anywhere"
    requirement: "TRACK-04"
    verification:
      - kind: integration
        ref: "Live Postgres check: after upsertApplicationStatus(id, 'saved'), SELECT is_active FROM opportunities WHERE external_id=... still returned true, and getApplicationsByExternalIds returned isSaved:false unchanged (the write only ever touches the status column, never opportunities.is_active or applications.is_saved)"
        status: pass
    human_judgment: false
  - id: D3
    description: "An opportunity never tracked defaults to 'not_applied' ('Por aplicar'), never null/undefined/error, both at the query layer and rendered in the UI"
    verification:
      - kind: integration
        ref: "scripts/verify-applications.ts: getApplicationsByExternalIds() on a never-tracked external_id returns a Map of size 0 (key absent, never present with a null status) — page.tsx's `?? \"not_applied\"` fallback confirmed live: curling the production build with an empty applications table showed all 16,111 rows rendering 'Por aplicar'"
        status: pass
    human_judgment: false
  - id: D4
    description: "pnpm exec tsc --noEmit && pnpm build run clean against the full plan's changes"
    verification:
      - kind: other
        ref: "pnpm exec tsc --noEmit (0 errors after .next/types generated by an initial build) and pnpm build (Compiled successfully, TypeScript check passed, all 4 static/dynamic routes generated) — re-run twice, once before and once after the tracer feedback gate"
        status: pass
    human_judgment: false
  - id: D5
    description: "The StatusDropdown's visual treatment (icon+text options, no box-shadow, matches the popover-surface/hairline-border tokens) genuinely reads as part of the locked DESIGN.md system rather than an unreviewed shadcn default"
    verification: []
    human_judgment: true
    rationale: "Automated checks (tsc/build, live-data persistence, is_active isolation) prove correctness and the shadow-md fix is documented, but whether the dropdown visually reads as native to DESIGN.md's 'Operator's Console' aesthetic in the running app is a visual judgment best made by looking at it — no Playwright/visual-diff harness was run in this plan (Phase 2's verify-a11y.ts pattern exists but wasn't re-invoked here, out of this plan's explicit task list)."

duration: ~1h
completed: 2026-09-08
status: complete
---

# Phase 3 Plan 1: Application Status Tracking Summary

**Applications queries + Zod-validated Server Action + a shadcn-select-based icon+text StatusDropdown, wired into a new "Postulación" column on Internships/Underclassmen, upserting by `opportunity_external_id` against a newly-constrained UNIQUE column — verified end-to-end against live dev Postgres including a real full-page-reload readback**

## Performance

- **Duration:** ~1h
- **Completed:** 2026-09-08T04:00:00Z
- **Tasks:** 3 (package-legitimacy checkpoint pre-approved per environment notes, tracer build, migration+regression script)
- **Files modified:** 11 (9 created, 2 modified)

## Accomplishments

- `src/db/queries/applications.ts`: `getApplicationsByExternalIds()` (single `inArray` query, no N+1, returns a `Map<string, ApplicationRecord>`) and `upsertApplicationStatus()` (Drizzle `onConflictDoUpdate` targeting `opportunity_external_id`, never the `opportunities` cache table's serial `id`)
- `applications.opportunity_external_id` UNIQUE constraint added via a real Drizzle migration (`drizzle/0001_wild_iron_lad.sql`), generated and applied against live dev Postgres with zero data loss (table was empty) — this is the actual DB-level prerequisite the upsert needs, not just a TypeScript-level assumption
- `updateApplicationStatus` Server Action (`src/app/actions/applications.ts`): validates the untrusted client-supplied `status` string against a Zod enum of the 6 valid values before it ever reaches the DB (T-03-01), then `revalidatePath`
- `StatusDropdown` (shadcn `select`, client component): every option pairs an icon with Spanish text (Bookmark/guardado, CircleDashed/por aplicar, Send/aplicado, Clock/en proceso, XCircle/rechazado, CheckCircle2/aceptado) — never icon-only or color-only, per DESIGN.md's Never-Color-Alone Rule; uses `useTransition` so the trigger dims to 50% opacity during the write instead of blocking the row
- Wired into `page.tsx`: one shared `applications` lookup for both Internships and Underclassmen tabs (both read the same table), new "Postulación" column inserted before "Link"; Benefits tab untouched (you don't "apply" to a benefit)
- `scripts/verify-applications.ts`: live-Postgres regression script confirming upsert-no-duplicate (1 row after 6 sequential writes), single-Map multi-external_id readback, and untracked-external_id absence — cleans up its own test rows, leaves real dev data untouched

## Task Commits

1. **Task 1: Package legitimacy checkpoint — shadcn `select`** - pre-approved per environment notes; confirmed via `git diff package.json` after install that no new npm package appeared (radix-ui meta-package already installed since Phase 2), so proceeded straight to the build
2. **Task 2: applications queries + Server Action + StatusDropdown, end-to-end** - `7bf77ff` (feat)
3. **Task 3: Migration verification + live-data regression script** - `243023f` (test)

**Plan metadata:** (this commit, docs)

## Files Created/Modified

- `src/db/queries/applications.ts` - `getApplicationsByExternalIds()`, `upsertApplicationStatus()`
- `src/app/actions/applications.ts` - `updateApplicationStatus` Server Action, Zod validation, `revalidatePath`
- `src/components/dashboard/status-dropdown.tsx` - icon+text `StatusDropdown` client component
- `src/components/ui/select.tsx` - shadcn `select` primitive (fixed: removed default `shadow-md`)
- `src/lib/application-status.ts` - `APPLICATION_STATUSES`/`ApplicationStatus` shared enum, no `pg` import
- `drizzle/0001_wild_iron_lad.sql` + `drizzle/meta/*` - UNIQUE constraint migration
- `scripts/verify-applications.ts` - live-Postgres regression script (upsert-no-duplicate, Map readback, untracked-absence)
- `src/db/schema.ts` - `opportunityExternalId` marked `.unique()`
- `src/app/page.tsx` - single `applicationsByExternalId` lookup, new "Postulación" column on `OpportunitiesTable`

## Decisions Made

See `key-decisions` in frontmatter for full rationale on: the UNIQUE-constraint migration, "guardado" as a `status` value (not the unused `isSaved` boolean), the client/server bundle split fix, the `shadow-md` removal, the two-phase `Promise.all` restructure, and the `.env.local` sandbox workaround.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Client bundle broke `pnpm build` by pulling the Postgres driver into the browser**
- **Found during:** Task 2, first `pnpm build` run
- **Issue:** `status-dropdown.tsx` ("use client") imported `APPLICATION_STATUSES`/`ApplicationStatus` from `@/db/queries/applications.ts`, which imports `@/db/client.ts`, which imports `pg`. Next.js's client bundler tried to resolve `pg`'s Node-only dependencies (`tls`, `util/types`) for the browser, failing the build with `Module not found`.
- **Fix:** Extracted the enum/type into `src/lib/application-status.ts` (zero `pg`/`db` imports), imported from there by both the client component and `db/queries/applications.ts` (which re-exports it for backward compatibility with the Server Action's import).
- **Files modified:** `src/lib/application-status.ts` (new), `src/db/queries/applications.ts`, `src/components/dashboard/status-dropdown.tsx`, `src/app/actions/applications.ts`
- **Verification:** `pnpm build` re-run, compiled successfully; `pnpm exec tsc --noEmit` clean.
- **Committed in:** `7bf77ff`

**2. [Rule 2 - Missing Critical, DESIGN.md compliance] Removed shadcn's default `shadow-md` from the select popover**
- **Found during:** Task 2, reviewing the generated `select.tsx` against DESIGN.md before wiring it up
- **Issue:** shadcn's stock `select` component ships `SelectContent` with `shadow-md`. DESIGN.md's Flat-By-Default Rule is explicit: "Introducing a shadow anywhere in this system is an unauthorized new depth language" — depth is tonal-layering (`popover-surface`) + hairline border only, matching CLAUDE.md's hard-constraint precedence over any generated default.
- **Fix:** Replaced `shadow-md ring-1 ring-foreground/10` with `border border-border` (the same hairline token used everywhere else — table rows, chip outlines, inputs).
- **Files modified:** `src/components/ui/select.tsx`
- **Verification:** Visually confirmed via the RSC payload/production build that the popover renders with the `border-border` hairline, no shadow class present in the compiled className string.
- **Committed in:** `7bf77ff`

---

**Total deviations:** 2 auto-fixed (1 build-breaking bug, 1 DESIGN.md-compliance fix). Both are corrections needed for the plan's own stated goals (a working build; matching the locked visual system exactly, per this plan's own instruction) — no scope creep.

## Issues Encountered

- **Sandbox denies all `.env*` file reads/writes in this worktree:** could not create `.env.local` as the environment notes suggested. Worked around by passing `DATABASE_URL` inline per Bash invocation (`export DATABASE_URL=... && pnpm ...`); `drizzle.config.ts`'s dotenv loader only sets a key if it isn't already present in `process.env`, so this is functionally identical for `db:generate`/`db:migrate`/`tsx` scripts. Production is unaffected since Dokploy sets `DATABASE_URL` directly as a container env var, never via `.env.local`.
- **Fresh worktree had no `node_modules`/`.next`:** the first `pnpm db:generate` run also triggered a full `pnpm install` (auto-run by the `db:generate` script's shell), and the first `tsc --noEmit` failed on an unrelated `LayoutProps<"/">` error from `src/app/layout.tsx` — confirmed pre-existing/environmental (Next.js 16 generates that global type into `.next/types` only after a build; the worktree had never been built). Ran `pnpm build` first, which resolved it; not a defect in this plan's code.

## User Setup Required

None new. `DATABASE_URL` continues to come from Dokploy env vars in production (unchanged from Phase 1); the local dev Postgres and its credentials were provided in this session's environment notes, not something Juan needs to configure.

## Next Phase Readiness

- Phase 3 Plan 2 (notes autosave, TanStack Virtual row virtualization, accessibility pass) can build directly on `applications.ts`'s query layer and the `StatusDropdown` pattern — the `notes`/`isSaved` columns already exist in the schema, untouched by this plan.
- TRACK-01 and TRACK-04 are fully satisfied. TRACK-03 is partial: status persistence/multi-device sync is proven (this plan), but the requirement's "notas" half is Plan 2's job — left unchecked in REQUIREMENTS.md pending that work, not silently marked done.
- The Phase 2 "recommended but not blocking" virtualization concern (16,109+ rows, 6-13s keyboard-reachability delay) is now more pressing: every row also renders a client `StatusDropdown` (Radix Select, more interactive than Phase 2's static rows). Plan 2's own scope already covers this (TanStack Virtual), per 03-CONTEXT.md's decision — flagged here as a live reminder, not a new blocker.
- No blockers.

---
*Phase: 03-application-tracking*
*Completed: 2026-09-08*

## Self-Check: PASSED

All 9 key files (queries, Server Action, StatusDropdown, select.tsx, application-status.ts, migration SQL, verify script, page.tsx, schema.ts) confirmed present on disk. Both task commit hashes (`7bf77ff`, `243023f`) confirmed present in `git log --oneline`.
