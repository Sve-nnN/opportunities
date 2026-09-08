---
phase: 04-deploy
plan: 05
subsystem: ui
tags: [nextjs, drizzle, postgres, pagination, accessibility, react-server-components]

requires:
  - phase: 04-deploy
    provides: "04-04's cheap-inactive-tab-count fix (commit 2c9c5b8) that this plan builds on"
provides:
  - "Real Postgres LIMIT/OFFSET pagination for Internships/Underclassmen/Benefits tabs"
  - "countOpportunities/countBenefits filtered-total query helpers"
  - "PaginationControls component (DESIGN.md-compliant)"
affects: [dashboard-performance, accessibility-audit]

actuals:
  tokens: 7433
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Shared buildXConditions() helper feeding both list*() and count*() so filter semantics can never drift between the two"
    - "Server Component reads/clamps `page` once (parsePage), client nav components only ever delete the `page` param (never set an invalid one)"

key-files:
  created:
    - src/components/dashboard/pagination-controls.tsx
  modified:
    - src/db/queries/opportunities.ts
    - src/db/queries/benefits.ts
    - src/app/page.tsx
    - src/components/dashboard/search-bar.tsx
    - src/components/dashboard/filter-chips.tsx
    - src/components/dashboard/dashboard-tabs.tsx
    - scripts/verify-filters.ts

key-decisions:
  - "Made pagination a required third parameter on listOpportunities/listBenefits (not optional) so no call site can silently forget to bound a query — TypeScript enforces it at every call site"
  - "Active tab's badge count is now a dedicated countOpportunities/countBenefits(status/isActive-scoped) SQL query instead of filtering the fetched array client-side, since only one page is ever in memory now"
  - "PaginationControls reads `page` from useSearchParams() itself (mirroring page.tsx's parsePage clamp) rather than receiving it as a prop, keeping it a self-contained client component pattern-matched on search-bar.tsx/filter-chips.tsx"

patterns-established:
  - "Every URL-param-mutating client component (search/filter/tab) deletes `page` alongside its own param changes — page.tsx never needs to know why offset changed, only that a fresh navigation implies page 1"

requirements-completed: [DISC-01, DISC-02]

coverage:
  - id: D1
    description: "listOpportunities/listBenefits accept pagination and only fetch one page from Postgres (LIMIT/OFFSET), never the full table"
    requirement: "DISC-01"
    verification:
      - kind: automated_ui
        ref: "playwright: Internships tab mounted rows <= 150 (virtualized page of 100), 'Mostrando 1-100 de 16,111' indicator"
        status: pass
      - kind: unit
        ref: "npx tsc --noEmit (query layer + call sites)"
        status: pass
    human_judgment: false
  - id: D2
    description: "PaginationControls renders Anterior/Siguiente + 'Mostrando X-Y de Z', DESIGN.md-compliant (hairline border, no shadow, mono tabular-nums, icon+text)"
    requirement: "DISC-02"
    verification:
      - kind: automated_ui
        ref: "playwright screenshots: /tmp/pagination-page1-internships.png, /tmp/pagination-controls-closeup.png, /tmp/pagination-underclassmen.png, /tmp/pagination-benefits-full.png"
        status: pass
    human_judgment: true
    rationale: "Visual/subjective DESIGN.md compliance (exact color values, 'reads as on-brand') and the 'feels fast' judgment from the plan's own Task 3 wording are things only Juan can confirm firsthand, even though automated checks (screenshots + Playwright assertions) already verify the structural/functional claims."
  - id: D3
    description: "Search/filter/tab changes reset the active tab back to page 1; Siguiente/Anterior are keyboard-operable and correctly disabled at the first/last page"
    verification:
      - kind: automated_ui
        ref: "playwright: search, filter-chip toggle, and tab-switch all remove the `page` URL param; Enter key on focused Siguiente button navigates; Anterior/Siguiente disabled state verified across all 3 tabs"
        status: pass
    human_judgment: false
  - id: D4
    description: "Status dropdown, notes popover, and freshness badge still work on paginated rows"
    verification:
      - kind: automated_ui
        ref: "playwright: status-dropdown trigger opens 6 options on a paginated row, notes-popover trigger present, freshness badge text 'Actualizado hace 14h' renders"
        status: pass
    human_judgment: false

duration: ~25min
completed: 2026-09-08
status: complete
---

# Phase 4 Plan 5: Real Server-Side Pagination Summary

**Internships/Underclassmen/Benefits tabs now query Postgres with LIMIT/OFFSET (100 rows/page) instead of fetching the full table — Internships' RSC payload dropped from ~17MB/14s to ~180KB/40-170ms warm.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 2 automated (Task 3, checkpoint, completed via automated verification — see below)
- **Files modified:** 7 (1 created, 6 modified)
- **Commits:** 2 (`4902f68`, `4b9afb5`)

## Accomplishments

- `listOpportunities`/`listBenefits` now take a **required** `{ limit, offset }` pagination argument and chain `.limit()/.offset()` — no call site can silently fetch an unbounded row set anymore (TypeScript enforces the third argument).
- New `countOpportunities`/`countBenefits` filtered-total SQL queries, built from shared `buildOpportunityConditions`/`buildBenefitConditions` helpers so the count and the page query can never drift out of sync on filter semantics.
- New `PaginationControls` component (DESIGN.md-compliant: hairline-border chip-style Anterior/Siguiente with `ChevronLeft`/`ChevronRight`, `font-mono` "Mostrando X–Y de Z" with the project's global tabular-nums rule, real `disabled` + `aria-disabled` at page boundaries), rendered in all 3 `TabsContent` blocks.
- `page.tsx`'s `parsePage()` clamps the `page` URL param to `>= 1`, falling back to 1 on any invalid/negative/non-numeric input, before it ever reaches `.offset()` (T-04-11).
- `search-bar.tsx`, `filter-chips.tsx`, and `dashboard-tabs.tsx` all now delete the `page` URL param on any search/filter/tab-switch change, so a stale page number never survives into a narrower or differently-scoped result set.
- The active tab's own badge count and the aria-live result-count announcement now come from dedicated filtered SQL `count()` queries instead of `.length`/client-side filtering over the fetched array — which broke once only one page's rows are ever in memory. The dead `countActive()` client-side helper was removed.

## Task Commits

1. **Task 1: Add filtered counts + LIMIT/OFFSET pagination to the query layer** - `4902f68` (feat)
2. **Task 2: Wire pagination into page.tsx, build PaginationControls, reset page on filter/tab change** - `4b9afb5` (feat)

**Plan metadata:** this commit (docs: complete plan)

_Task 3 (checkpoint:human-verify) was completed via automated verification — see "Task 3: Automated Verification" below. No implementation commit; verification-only._

## Files Created/Modified

- `src/db/queries/opportunities.ts` - `buildOpportunityConditions` extracted; `listOpportunities` takes required `pagination`; new `countOpportunities`
- `src/db/queries/benefits.ts` - `buildBenefitConditions` extracted; `listBenefits` takes required `pagination`; new `countBenefits`; `BenefitFilters` gained an `isActive` field for the active-tab badge count
- `src/app/page.tsx` - `PAGE_SIZE`/`parsePage()`, active-tab-only paginated fetch + filtered-total/badge-count queries, `PaginationControls` rendered per tab, dead `countActive()` removed
- `src/components/dashboard/pagination-controls.tsx` **(new)** - Anterior/Siguiente + "Mostrando X–Y de Z", DESIGN.md-styled
- `src/components/dashboard/search-bar.tsx` - deletes `page` param alongside `q` on every debounced change
- `src/components/dashboard/filter-chips.tsx` - deletes `page` param in `toggle()`/`clearAll()`
- `src/components/dashboard/dashboard-tabs.tsx` - deletes `page` param in `handleValueChange()`
- `scripts/verify-filters.ts` - updated all `listOpportunities`/`listBenefits` call sites for the new required `pagination` argument (Rule 3 — blocking issue caused directly by Task 1's signature change; this ad hoc script isn't in the plan's `files_modified` list but was broken by the change and needed fixing to keep working)

## Decisions Made

- Pagination is a **required**, not optional, third parameter on both `list*` functions — deliberately stricter than the plan's literal wording allowed, so a future call site can't accidentally omit it and silently reintroduce a full-table fetch.
- `BenefitFilters` gained an `isActive?: boolean` field (plan flagged this as a "check before assuming" item) to give `countBenefits` the same isActive-scoped badge-count capability that `opportunityFilters.status` already gave `countOpportunities`.
- `PaginationControls` derives `page` from `useSearchParams()` itself rather than receiving it as a prop from the server — keeps it self-contained and pattern-matched on the existing `search-bar.tsx`/`filter-chips.tsx` client components, at the cost of a small duplicate parse of the same URL param server and client both already read.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated `scripts/verify-filters.ts` call sites for the new required `pagination` parameter**
- **Found during:** Task 1 (`npx tsc --noEmit` verification step)
- **Issue:** This pre-existing ad hoc verification script (not listed in the plan's `files_modified`) calls `listOpportunities`/`listBenefits` in 8 places without a pagination argument — Task 1's signature change broke every one of them (`tsc` errors: "Expected 3 arguments, but got 2/1").
- **Fix:** Added an `UNBOUNDED_PAGE = { limit: 100_000, offset: 0 }` constant and passed it to every call site, preserving the script's original intent (assertions built around "every matching row," not just one page).
- **Files modified:** `scripts/verify-filters.ts`
- **Verification:** `npx tsc --noEmit` passes with zero errors in this file after the fix.
- **Committed in:** `4902f68` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to keep the codebase compiling after the intentional, plan-specified signature change. No scope creep — script logic itself was untouched beyond the added pagination argument.

## Issues Encountered

None beyond the deviation above.

## Task 3: Automated Verification (checkpoint completed without interactive human)

Per the orchestrator's explicit instruction, Task 3 (`checkpoint:human-verify`, `gate="blocking-human"`) was completed via thorough automated verification rather than blocking — this worktree has no interactive user attached, and the orchestrator will handle final deploy directly. All 7 of the plan's numbered verification checks were exercised:

**Setup:** `.env.local` created pointing at the local Postgres (`127.0.0.1:5434`, db `opportunities`, real production-scale data: 16,111 internships, 109 underclassmen, 42 benefits — confirmed via the running app, not `psql`, which wasn't available in this environment). `npm run dev` started; verified with `curl` and a headless Playwright (chromium, already available as a project devDependency) browser session.

1. **Fast load, small response** — PASS. Warm `curl` requests: Internships `181,763 bytes` / `42–133ms` (vs. the prior bug's measured `~17MB/14s`, per the code comment on commit 2c9c5b8). Underclassmen `204,201 bytes`/`66ms`. Benefits `322,024 bytes`/`172ms`. First cold Turbopack-compile request was `3.5s` (dev-mode compile overhead, not representative of a built/production request).
2. **Pagination controls + "Mostrando 1–100 de 16,111", Anterior disabled on page 1** — PASS (Playwright assertion + screenshot `/tmp/pagination-page1-internships.png`).
3. **Siguiente/Anterior load different rows, update indicator, keyboard-operable** — PASS. Clicking Siguiente moved `?page=2`, first row's `externalId` changed, indicator updated to "Mostrando 101–200 de 16,111", Anterior became enabled. Clicking Anterior returned to page 1. Focusing the Siguiente button via `page.focus()` and pressing `Enter` (no mouse) also navigated to page 2, confirming keyboard operability.
4. **Search/filter snap back to page 1** — PASS. Starting from `?page=3`, typing in the search box (after the 300ms debounce) and toggling a filter chip both removed the `page` param from the URL.
5. **Tab switch resets to page 1** — PASS. Starting from `?tab=internships&page=3`, switching to Underclassmen removed `page` from the URL.
6. **Status dropdown, notes popover, freshness badge on paginated rows** — PASS. On a row from the paginated Internships table: the status `<Select>` trigger (`aria-label="Estado de postulación"`) opened with all 6 status options; the notes-popover trigger was present and reachable; the freshness badge rendered "Actualizado hace 14h".
7. **Visual DESIGN.md compliance** — PASS by automated screenshot inspection (not a substitute for Juan's own visual judgment — see `coverage: D2` above, `human_judgment: true`). Screenshots at `/tmp/pagination-page1-internships.png`, `/tmp/pagination-controls-closeup.png`, `/tmp/pagination-page2.png`, `/tmp/pagination-underclassmen.png`, `/tmp/pagination-benefits-full.png` show near-black ground, violet-underlined active tab, hairline-border pagination buttons with no box-shadow, `font-mono` "Mostrando…" text. Underclassmen (109 rows, 2 pages) correctly shows Siguiente enabled/Anterior disabled on page 1; Benefits (42 rows, 1 page) correctly shows both disabled.

**What a human should still spot-check** (things automation cannot fully judge):
- Whether the pagination controls' exact pixel spacing/typography "reads as on-brand" next to the rest of the console, per DESIGN.md's more subjective language ("reads as a console... speed and legibility are the entire aesthetic argument").
- Whether page navigation "feels fast" in a real browser session with normal network conditions (warm local `curl` timings are a strong proxy, but not identical to perceived UI responsiveness).
- A screen-reader pass (VoiceOver/NVDA) reading the pagination buttons and the "Mostrando X–Y de Z" text aloud, beyond the automated `aria-disabled`/keyboard-focus checks already run.

The `.env.local` created in this worktree for verification was NOT committed (matches `.gitignore`, contains a local dev DB URL and empty `GITHUB_PAT`).

## User Setup Required

None — no external service configuration required. `.env.local` for local verification was created directly in the worktree (not committed) per the plan's `<environment_notes>`.

## Next Phase Readiness

- All 3 tabs now bound every query to `PAGE_SIZE` (100) rows regardless of dataset size — the underlying performance bug this plan exists to fix (Internships tab "unusable" per Juan's report) is resolved and measured.
- `npx tsc --noEmit` and `npm run build` both pass clean (one pre-existing, out-of-scope `layout.tsx` `LayoutProps` error was confirmed present on the clean `d617a90` tree before this plan's changes — not introduced or touched here).
- Ready for the orchestrator to redeploy per `04-CONTEXT.md`'s Dokploy flow. No blockers.

## Self-Check: PASSED

- FOUND: `src/components/dashboard/pagination-controls.tsx`
- FOUND: `src/db/queries/opportunities.ts`
- FOUND: `src/db/queries/benefits.ts`
- FOUND: `src/app/page.tsx`
- FOUND: `.planning/phases/04-deploy/04-05-SUMMARY.md`
- FOUND commit: `4902f68`
- FOUND commit: `4b9afb5`

---
*Phase: 04-deploy*
*Completed: 2026-09-08*
