---
phase: 02-discovery-ui
plan: 02
subsystem: ui
tags: [nextjs, drizzle, postgres, url-state, a11y, tailwind-v4]

requires:
  - phase: 02-discovery-ui
    provides: "Plan 1's shadcn dashboard scaffold (3-tab Server Component page.tsx, listOpportunities/listBenefits read queries, locked violet/near-black theme, status-pill.tsx)"
provides:
  - "listOpportunities(source, filters?) / listBenefits(filters?) — search/category/roleType/status filtering, all AND-combined via Drizzle's and()/or()/eq()/ilike(), never raw string interpolation"
  - "getDistinctCategories(source) / getDistinctRoleTypes(source) — feed filter-chip options from values that actually exist in the data"
  - "URL-driven filter state (q/category/roleType/status/tab searchParams), read server-side in page.tsx, written client-side by SearchBar/FilterChips/DashboardTabs via router.replace"
  - "DashboardSkeleton + src/app/loading.tsx — the only loading state this app ever shows"
affects: [phase-2-discovery-ui-plan-3, phase-3-application-tracking]

actuals:
  tokens: 9250
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Filter/search state lives entirely in URL searchParams (q, category, roleType, status, tab) — no client-side fetch layer, no React state beyond the debounce buffer in SearchBar. page.tsx (Server Component) reads searchParams and forwards them into the Drizzle query only for whichever tab is currently active."
    - "Active tab is mirrored into a `tab` URL param by DashboardTabs (client wrapper around shadcn's Tabs) specifically so the Server Component can know which of the 3 datasets should receive q/category/roleType/status — Radix's own tab state is client-only and invisible server-side. Switching tabs clears all filter params (each tab has its own filter vocabulary)."
    - "Filter chips are generated from getDistinctCategories/getDistinctRoleTypes (live data), never a hardcoded list — a chip only ever exists if at least one row in the active tab's data matches it."
    - "No test framework in this stack (STACK.md) — filter behavior is verified by an ad hoc tsx script (scripts/verify-filters.ts) run against live Postgres, same convention Phase 1 established for runSync() verification."

key-files:
  created:
    - scripts/verify-filters.ts
    - src/components/dashboard/search-bar.tsx
    - src/components/dashboard/filter-chips.tsx
    - src/components/dashboard/dashboard-tabs.tsx
    - src/components/dashboard/dashboard-skeleton.tsx
    - src/app/loading.tsx
  modified:
    - src/db/queries/opportunities.ts
    - src/db/queries/benefits.ts
    - src/app/page.tsx

key-decisions:
  - "Added src/components/dashboard/dashboard-tabs.tsx (not in the plan's file list) as a thin client wrapper around shadcn's Tabs that mirrors the active tab into a `tab` URL param. Necessary plumbing: the plan's own Task 2 action requires 'filters apply only to the active tab,' which is impossible to know server-side from Radix's client-only tab state alone."
  - "Switching tabs clears q/category/roleType/status rather than carrying them forward, since Internships' categories aren't Underclassmen's — carrying a filter across tabs would silently produce a confusing near-empty view instead of the fresh dataset the user expects."
  - "No test framework installed for the tdd=true Task 1. This project's STACK.md establishes no test runner, and Plan 1 already precedented ad hoc tsx-script + direct-Postgres-query verification over a committed test suite. Installing vitest/jest for one task would be an unrequested architecture change (Rule 4 territory) the plan's own <verify> step (`pnpm exec tsc --noEmit`) doesn't call for. Wrote scripts/verify-filters.ts instead: a real RED (failed against the old unfiltered functions) / GREEN (passes against the new filtered functions) cycle, committed as test()/feat(), runnable via `pnpm exec tsx scripts/verify-filters.ts` against live Postgres — every filtered value it asserts on is derived from a live row, never hardcoded."
  - "benefits.ts's `tag` filter field exists in the BenefitFilters interface (matching the plan's stated shape) but isn't wired to a chip in the UI — the plan's must_haves truths only require category/roleType/status chips for the opportunities tabs and a global search bar for all tabs; Benefits' own required behavior is 'search matches title/description/tag,' which is implemented and verified. `tag` is available for a future plan to wire a chip to without a query-layer change."
  - "Added a 'Limpiar filtros' text link inside FilterChips, visible only when a filter is active — not explicitly required by must_haves, but a natural, low-cost affordance for the done criterion 'clearing all filters restores the full tab dataset.'"

requirements-completed: [DISC-02]

coverage:
  - id: D1
    description: "Typing in the search bar (debounced 300ms) updates ?q= and the active tab's table narrows to rows matching title/company (opportunities) or title/description/tag (benefits), case-insensitively"
    requirement: "DISC-02"
    verification:
      - kind: integration
        ref: "scripts/verify-filters.ts run via tsx against live Postgres (5 required behaviors, all pass) + curl cross-checks against direct SQL COUNT queries: ?q=DV%20Trading (internships), ?tab=underclassmen&q=Kalshi, ?tab=benefits&q=JetBrains all return exactly the expected row count"
        status: pass
    human_judgment: false
  - id: D2
    description: "Category/roleType/status filter chips are accessible toggle buttons (aria-pressed) built from live distinct values (never a dead filter), and combine with search + each other as AND"
    requirement: "DISC-02"
    verification:
      - kind: integration
        ref: "curl ?q=TikTok&category=AI%2FML%2FData&status=open returned exactly 94 table rows (93 matches + 1 header), matching `SELECT COUNT(*) ... WHERE category=$1 AND is_active=true AND company ILIKE $2` = 93; aria-pressed=\"true\" confirmed present on the active category chip in rendered HTML"
        status: pass
    human_judgment: false
  - id: D3
    description: "Clearing all filters restores the full tab dataset; a zero-match filter combination renders a visible 'No se encontraron resultados' row instead of a blank table"
    verification:
      - kind: integration
        ref: "curl ?q=zzzz-no-such-opportunity-should-ever-match-zzzz renders the message row; curl with no params returns the full unfiltered 16,109-row Internships dataset (16,110 table-row tags = 16,109 + 1 header)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Filters are scoped to the active tab — switching tabs (via the tab URL param) never leaks another tab's filter state into a totally different data source"
    verification:
      - kind: integration
        ref: "curl ?q=TikTok&category=...&status=open (Internships active) followed by curl ?tab=underclassmen&q=Kalshi confirmed Underclassmen's own scoped search independently, and DashboardTabs clears filters on tab change"
        status: pass
    human_judgment: false
  - id: D5
    description: "Loading state is always DashboardSkeleton (tab bar + search bar + chip + 8-row table outlines), never a spinner, with no jarring layout shift into the real table"
    verification:
      - kind: integration
        ref: "Temporary 2.5s artificial delay in page.tsx (reverted, not committed) + `curl -N --max-time 1.5` captured the streamed response mid-fetch: 110 animate-pulse blocks and the sr-only \"Cargando datos…\" status present, zero real table rows until the fetch resolved"
        status: pass
    human_judgment: false
  - id: D6
    description: "Visual direction matches the locked contract: chips (not dropdowns), violet focus ring on the search input, command-palette-style search entry, chips/skeleton never rely on color alone"
    verification: []
    human_judgment: true
    rationale: "Automated checks confirm the correct ARIA attributes, URL wiring, and query-narrowing behavior, but whether the search bar/chips/skeleton actually *read* as the locked 'command-driven data tool' direction (density, restrained accent usage, chip affordance clarity) is a visual judgment call best made by looking at the running app."

duration: ~20min
completed: 2026-09-07
status: complete
---

# Phase 2 Plan 2: Filterable Queries + Search Bar/Filter Chips/Skeleton Loaders Summary

**Extended Plan 1's read-query layer with search/category/roleType/status filtering (Drizzle and()/or()/eq()/ilike(), never raw SQL), wired it to command-palette-style URL-driven search + accessible filter chips scoped per active tab, and replaced all loading states with a layout-matched skeleton — all verified end-to-end against the live 16,109-row dev Postgres**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-09-07T23:46:25Z
- **Tasks:** 3 (Task 1 was `tdd="true"`: RED test commit, then GREEN implementation commit)
- **Files modified:** 9 (6 created, 3 modified)

## Accomplishments
- `listOpportunities(source, filters?)` now supports `search` (title/company ILIKE), `category` (exact), `roleType` (exact), and `status` (`open`/`closed` → `isActive` true/false, omitted → both), all AND-combined; `listBenefits(filters?)` supports `search` across title/description/tags
- `getDistinctCategories(source)` / `getDistinctRoleTypes(source)` feed filter-chip options from values that actually exist in the live data — no dead filters (an internships-tab chip never appears for a category with zero matching rows)
- `SearchBar` (debounced 300ms, `router.replace` with `scroll: false`) and `FilterChips` (accessible `aria-pressed` toggle buttons, fixed Abierto/Cerrado status chips, a "Limpiar filtros" escape hatch) live in the top bar, both driving/reading URL `searchParams`
- `DashboardTabs` mirrors the active tab into a `tab` URL param so `page.tsx` (a Server Component) knows which of the 3 datasets should receive the filter params — filters never leak across tabs, and switching tabs clears them
- `DashboardSkeleton` + `src/app/loading.tsx`: the only loading state this app ever shows, shaped like the real dashboard (tab bar, search bar, chip row, 8-row table) so there's no layout shift, with a screen-reader-only "Cargando datos…" status
- Both tables now render a visible "No se encontraron resultados con estos filtros." row instead of a blank body on a zero-match filter combination
- Verified every required behavior against the live dev Postgres (16,109 internships + 109 underclassmen + 42 benefits rows): search, each chip type individually and combined, tab-scoped isolation, zero-match messaging, and skeleton-during-fetch streaming — all cross-checked against direct SQL `COUNT` queries, not just eyeballed

## Task Commits

1. **Task 1a (RED): failing filter regression check** - `8afa97f` (test)
2. **Task 1b (GREEN): filterable queries + distinct-value helpers** - `72325b8` (feat)
3. **Task 2: search bar + filter chips wired to page.tsx via URL searchParams** - `e589b92` (feat)
4. **Task 3: skeleton loaders replacing generic loading states** - `db13c63` (feat)

**Plan metadata:** (this commit, docs)

## Files Created/Modified
- `src/db/queries/opportunities.ts` - `OpportunityFilters`, `listOpportunities(source, filters?)`, `getDistinctCategories`, `getDistinctRoleTypes`
- `src/db/queries/benefits.ts` - `BenefitFilters`, `listBenefits(filters?)` (search across title/description/tags)
- `src/components/dashboard/search-bar.tsx` - Debounced (300ms) client search input, `q` URL param
- `src/components/dashboard/filter-chips.tsx` - Accessible toggle chips (category/roleType/status), "Limpiar filtros"
- `src/components/dashboard/dashboard-tabs.tsx` - Client wrapper syncing active tab into `tab` URL param
- `src/components/dashboard/dashboard-skeleton.tsx` - Layout-matched loading placeholder
- `src/app/loading.tsx` - Next.js automatic loading-UI convention, renders `DashboardSkeleton`
- `src/app/page.tsx` - Reads `searchParams`, scopes filters to the active tab, zero-match message rows
- `scripts/verify-filters.ts` - Ad hoc tsx regression check for the 5 required filter behaviors, run against live Postgres

## Decisions Made
- See `key-decisions` in frontmatter for full rationale on `dashboard-tabs.tsx` (necessary plumbing, not in the plan's original file list), the tab-switch filter-reset behavior, and skipping a test-framework install in favor of an ad hoc tsx script matching Phase 1's established convention.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `dashboard-tabs.tsx`, not in the plan's file list**
- **Found during:** Task 2, implementing "filters apply only to the active tab"
- **Issue:** The plan's Task 2 action explicitly requires filters to apply only to the currently active tab, but the existing `Tabs` component (Plan 1) used uncontrolled `defaultValue` state — purely client-side, invisible to the `page.tsx` Server Component that decides which dataset gets which filters.
- **Fix:** Added a small client wrapper (`DashboardTabs`) around shadcn's `Tabs` that mirrors the active tab into a `tab` URL param via `router.replace`, giving `page.tsx` the information it needs at request time. Also clears filter params on tab change (each tab has a different filter vocabulary).
- **Files modified:** `src/components/dashboard/dashboard-tabs.tsx` (new), `src/app/page.tsx`
- **Verification:** `pnpm exec tsc --noEmit && pnpm build` clean; curl-verified that Internships-scoped filters don't affect Underclassmen's independently-scoped search.
- **Committed in:** `e589b92`

**2. [Rule 2 - Missing Critical] Zero-match state was a blank table body**
- **Found during:** Task 2, reviewing the done criteria before committing
- **Issue:** Without an explicit empty-state row, a filter combination matching zero rows would render a `<tbody>` with no rows at all — visually indistinguishable from "table still loading" or "something broke," and the plan's own done criteria requires a visible "no results" message.
- **Fix:** Both `OpportunitiesTable` and `BenefitsTable` now render a single spanning row with "No se encontraron resultados con estos filtros." when `rows.length === 0`.
- **Files modified:** `src/app/page.tsx`
- **Verification:** curl `?q=zzzz-no-such-opportunity-should-ever-match-zzzz` renders the message.
- **Committed in:** `e589b92`

---

**Total deviations:** 2 auto-fixed (1 blocking/necessary plumbing, 1 missing-critical UX completeness)
**Impact on plan:** Neither changed the plan's architecture or scope — `dashboard-tabs.tsx` is the minimum wiring required to satisfy a requirement the plan's own Task 2 action text already stated, and the zero-match row hardens an already-planned done criterion. No scope creep.

## Issues Encountered
- `pnpm exec tsc --noEmit` fails with `Cannot find name 'LayoutProps'` in a completely fresh worktree checkout until `pnpm build` has run once — same pre-existing Next.js 16 typed-routes artifact Plan 1 documented (not caused by this plan, resolves after one `pnpm build`, which the plan's own verify step already runs).
- `role_type` is `NULL` for every row in the live dataset (both `summer2027-internships` and `underclassmen-opportunities` — confirmed via direct query). `getDistinctRoleTypes` correctly returns `[]` and `FilterChips` correctly renders zero roleType chips as a result — this is the "no dead filters" requirement working as intended, not a bug, but worth flagging: roleType filtering has no visible UI surface today because the underlying data has no roleType values yet (an ingestion-side gap from Phase 1, out of this plan's scope).
- Could not write `.env.local` in this worktree (same dotenv permission-deny rule Plan 1 hit) — used inline `DATABASE_URL=... pnpm build`/`pnpm dev`/`pnpm exec tsx` environment-variable prefixes for every verification command instead. No production code path changed.

## User Setup Required
None new. Unchanged from Plan 1 / Phase 1.

## Next Phase Readiness
- Plan 3 (freshness badges via `sync_log`, a11y/finish pass) can build directly on this plan's URL-searchParams pattern and `DashboardTabs`'s `tab` param — the freshness badge slot (direction contract's top-bar right side) was deliberately left empty, not stubbed.
- `BenefitFilters.tag` exists at the query layer and is verified (via `search` matching tag content) but has no dedicated chip yet — a low-effort follow-up if a future plan wants tag-based chip filtering for the Beneficios tab.
- `getDistinctRoleTypes` is correct but currently always returns `[]` since no source row has a `roleType` value — if Phase 1's ingestion is later extended to populate `role_type`, roleType chips will appear automatically with zero UI changes needed.
- No blockers.

---
*Phase: 02-discovery-ui*
*Completed: 2026-09-07*

## Self-Check: PASSED

All 9 key files (script + 5 new components/routes + 3 modified query/page files) confirmed present on disk. All 4 task commit hashes (`8afa97f`, `72325b8`, `e589b92`, `db13c63`) confirmed present in `git log --oneline`.
