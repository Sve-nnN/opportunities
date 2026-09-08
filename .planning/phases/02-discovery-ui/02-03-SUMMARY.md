---
phase: 02-discovery-ui
plan: 03
subsystem: ui
tags: [nextjs, drizzle, postgres, a11y, playwright, impeccable, tailwind-v4]

requires:
  - phase: 02-discovery-ui
    provides: "Plan 1/2's dashboard scaffold, filterable queries, search bar/filter chips/skeleton loaders — 3-tab Server Component page.tsx over live Postgres"
provides:
  - "getLatestSyncPerSource()/isSourceStale() (src/db/queries/sync-log.ts) — per-source freshness lookup + pure staleness helper (never-synced, success=false, or finishedAt >6h ago)"
  - "FreshnessBadge + StaleSyncBanner components, wired per-tab into page.tsx, reading real sync_log data (DISC-04 discharged)"
  - "A real, measured accessibility pass: scripts/verify-a11y.ts (Playwright + in-page canvas color resolution for WCAG contrast, keyboard walkthrough, native semantics, aria-live)"
  - "DESIGN.md + .impeccable/design.json — the project's first design system record, written from the built world"
  - "⌘K/Ctrl+K search-summon shortcut (search-bar.tsx), discharging the direction contract's named command-palette signature interaction"
affects: [phase-3-application-tracking]

actuals:
  tokens: 19535
  tasks: 3
  commits: 6

tech-stack:
  added: [playwright@1.63.0 (devDependency only, verified maintainer: Microsoft)]
  patterns:
    - "Freshness/staleness reads use Drizzle's typed query builder (selectDistinctOn), never raw sql`` — raw SQL would return snake_case column names, breaking the schema's camelCase field mapping silently"
    - "Accessibility/visual verification is measured via real Playwright automation against the PRODUCTION standalone build (node .next/standalone/server.js), never `pnpm dev` — Next.js dev-mode Turbopack overhead was measured causing 50-90s page loads and a React Strict Mode double-effect artifact that made Radix's roving-focus tablist appear permanently unreachable by keyboard in dev only; neither reproduces in production"
    - "WCAG contrast checks resolve computed CSS colors (which Tailwind v4 emits as oklab()/oklch(), not rgb()) via an in-page <canvas> fillStyle round-trip, not regex — this is the only reliable way to read a color a browser might report in any CSS Color 4 syntax"
    - "Focus-indicator contrast must be measured via a REAL page.keyboard.press('Tab'), never locator.focus() — Playwright's programmatic .focus() does not reliably trigger the same :focus-visible browser heuristic as a genuine keypress, and measuring via .focus() produces false readings in both directions (false pass and false fail were both observed on the same element across different runs)"

key-files:
  created:
    - src/components/dashboard/freshness-badge.tsx
    - src/components/dashboard/stale-sync-banner.tsx
    - scripts/verify-freshness.ts
    - scripts/verify-a11y.ts
    - scripts/capture-finish-screenshots.ts
    - DESIGN.md
    - .impeccable/design.json
    - .impeccable/review/desktop.png
    - .impeccable/review/mobile.png
  modified:
    - src/db/queries/sync-log.ts
    - src/app/page.tsx
    - src/components/ui/input.tsx
    - src/components/ui/button.tsx
    - src/components/dashboard/search-bar.tsx
    - package.json
    - pnpm-lock.yaml

key-decisions:
  - "getLatestSyncPerSource() uses db.selectDistinctOn([syncLog.source]) (Drizzle's typed query builder), not a raw `sql` DISTINCT ON — raw SQL execute() returns Postgres's native snake_case column names (started_at, finished_at), silently breaking the isSourceStale() helper's field reads against the schema's camelCase mapping. Caught before it shipped by checking the query builder's actual return shape."
  - "Capped the filter-chips row at max-h-24 with its own internal scroll (page.tsx), discovered as a genuine layout-collapsing bug: Underclassmen's real ingested data has 102 distinct `category` values (long eligibility-requirement strings, a Phase 1 data-quality gap — see Issues Encountered), which pushed the unbounded flex-wrap chip row past 1500px tall and squeezed the table's flex-1 sibling to 0 height, Playwright-measured, making the entire Underclassmen tab invisible on load."
  - "Line-clamped Title/Location table cells to 2 lines with a max-width (page.tsx), found during the finish flow's mandatory mobile screenshot: a real row (Ernst & Young, a 13-city Location value) wrapped to 10+ lines at the mobile column width, ballooning that single row to 257px vs. a normal 57px. Wrapped in an inner clamped <div> rather than applying line-clamp to the <td> itself, since line-clamp's `display: -webkit-box` would break the cell's required `display: table-cell`."
  - "Bumped input.tsx/button.tsx's focus-visible:ring-ring/50 to full-opacity ring-ring after 3x-repeated, real-keyboard-Tab Playwright measurement (plus confirmation against the compiled CSS's cascade order) showed 2.06:1 — below WCAG AA's 3:1 focus-indicator floor — since both components' unconditional `outline-none` (Tailwind v4 semantics: truly removes the outline, unlike v3's forced-colors-safe trick) disables the app's own opaque global `:focus-visible` fallback, leaving the translucent ring as the only indicator."
  - "This harness has no Agent/Task subagent-spawning tool available, so both the Impeccable finish-reviewer and documenter roles ran inline, following their own degraded-mode instructions (reference/degraded/finish-reviewer.md, degraded/documenter.md) rather than the orchestrator's originally-intended spawned-subagent flow. Disclosed per that protocol's own requirement — see 'Deviations' below."
  - "DESIGN.md's qualitative/narrative language (North Star \"The Operator's Console\", color/rule names) was authored directly rather than through an interactive user Q&A round, since this plan executes autonomously with no live user available mid-execution. Grounded entirely in the already-locked direction contract's own THESIS/OWN-WORLD/FORM language and the actual shipped globals.css tokens — not invented from scratch."

requirements-completed: [DISC-04]

coverage:
  - id: D1
    description: "Every tab shows a real 'Actualizado hace Xh/Xmin' freshness badge, computed from the active tab's source's actual latest sync_log.finished_at (via getLatestSyncPerSource()), not a hardcoded or client-derived timestamp"
    requirement: "DISC-04"
    verification:
      - kind: integration
        ref: "Live curl/Playwright against real Postgres sync_log rows: badge showed 'Actualizado hace 1h' matching finishedAt exactly; re-verified after a real scheduled-cron sync fired mid-session (16,109->16,111 internships rows) that the badge tracked the new finishedAt"
        status: pass
    human_judgment: false
  - id: D2
    description: "Inserting a sync_log row with success=false (or >6h stale) for one source shows an explicit icon+text stale/failed banner on that tab only, surfacing the real errorMessage on failure; other tabs are unaffected"
    requirement: "DISC-04"
    verification:
      - kind: integration
        ref: "Inserted a live success=false sync_log row (errorMessage 'GitHub API rate limit exceeded (403)') for underclassmen-opportunities; scripts/verify-freshness.ts (RED/GREEN unit-level isSourceStale coverage) + a Playwright DOM check confirmed the banner rendered only inside the underclassmen tabpanel (0 alerts in internships/benefits panels)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Full keyboard walkthrough (tabs -> search -> chips -> external links) reaches every control with a visible, WCAG-AA-contrast (>=3:1 UI, >=4.5:1 text) focus indicator and no trap; native table semantics (scope=col); aria-live result-count announcement"
    verification:
      - kind: automated_ui
        ref: "scripts/verify-a11y.ts run against the production standalone build via Playwright: 40-stop real keyboard walkthrough reached tab/search/chip/link controls (18 unique elements, no full-cycle trap); tab-button and search-input focus indicators both measured 4.99:1 (>=3:1) via real Tab presses; body/muted/accent text measured 15.63:1/6.75:1/4.99:1 (all >=4.5:1) via in-page canvas color resolution; 5x scope=col confirmed; aria-live region confirmed present and updating with real filtered counts"
        status: pass
      - kind: manual_procedural
        ref: "Visual judgment of whether the dense, restrained-accent 'command-driven data tool' read is actually achieved (vs. just automatable checks passing) — see 02-01-SUMMARY.md D5's identical rationale for this same category of check"
        status: unknown
    human_judgment: true
    rationale: "Automated checks confirm exact contrast ratios, keyboard reachability, and ARIA wiring, but whether the rendered result genuinely reads as a fast, uncluttered command console (vs. merely passing numeric floors) is a visual/experiential judgment best made by looking at the running app."
  - id: D4
    description: "Impeccable finish flow (detect + screenshots + finish-reviewer + documenter) actually ran against the shipped page.tsx/layout.tsx/globals.css and components, ending with disposition ship and DESIGN.md written from the built world"
    verification:
      - kind: other
        ref: "impeccable detect --json returned [] across all changed files (re-confirmed after each fix); .impeccable/review/desktop.png + mobile.png captured via Playwright against the real production build with live data, validated (no blank/black regions, no shimmer); inline finish-reviewer (degraded mode, no Agent/Task tool available in this harness) found one material gap (missing ⌘K signature interaction), fixed and verdict-scored resolved, disposition recomputed to ship; DESIGN.md + .impeccable/design.json written by the inline documenter role from globals.css tokens and shipped components"
        status: pass
    human_judgment: true
    rationale: "The finish-reviewer and documenter roles ran INLINE, not as spawned subagents (this harness exposed no Agent/Task tool), per their own degraded-mode fallback protocol. A fresh, unbiased subagent review carries more evidentiary weight than the same agent stepping 'out of' its own build context — Juan should treat this disposition as provisional and can request a true independent re-review if a harness with subagent support becomes available."

duration: ~2h
completed: 2026-09-08
status: complete
---

# Phase 2 Plan 3: Sync Freshness UI + Accessibility Pass + Impeccable Finish Summary

**Real per-tab "synced Xh ago" freshness badges and stale/failed-sync warning banners wired to live `sync_log` data, a measured (not eyeballed) WCAG AA accessibility pass run via Playwright against the production build, and a completed Impeccable finish flow (detector, screenshots, finish-review, DESIGN.md) that caught and fixed three real defects — a layout-collapsing filter-chip overflow, a table-row-ballooning mobile wrap bug, and a below-floor focus-ring contrast — none of which were visible from code review alone**

## Performance

- **Duration:** ~2h
- **Completed:** 2026-09-08T01:35:00Z
- **Tasks:** 3 (as planned), plus 2 additional fix commits from defects the finish-flow's own mandatory verification steps (real screenshots, real keyboard Tab, real contrast measurement) surfaced
- **Files modified:** 16 (9 created, 7 modified)

## Accomplishments

- `getLatestSyncPerSource()` + `isSourceStale()` (src/db/queries/sync-log.ts): per-source latest sync_log row (DISTINCT ON via Drizzle's typed `selectDistinctOn`, not raw SQL) and a pure, unit-tested staleness predicate (never-synced, success=false, or finishedAt >6h ago)
- `FreshnessBadge` + `StaleSyncBanner`, wired per-tab into `page.tsx`: real "Actualizado hace Xh/Xmin" per active tab's source, and an icon+text warning banner (surfacing the real `errorMessage` on failure) scoped so one source's problem never leaks into another tab
- A genuinely measured accessibility pass (not a visual skim): `scope="col"` on every table header, an `aria-live="polite"` filtered-result-count region, and `scripts/verify-a11y.ts` — a real Playwright harness that walks the keyboard tab order, resolves computed CSS colors (including Tailwind v4's oklab()/oklch() output) via an in-page `<canvas>` round-trip, and measures actual WCAG contrast ratios rather than reading hex values off a stylesheet
- Full Impeccable finish flow completed end-to-end: zero detector findings across every changed file, `desktop.png`/`mobile.png` captured against the real production standalone build with live data, an inline finish-review (this harness has no subagent tool) that found and fixed one genuine gap — the direction contract's named ⌘K command-palette signature interaction was never actually wired to a keyboard shortcut — and `DESIGN.md` + `.impeccable/design.json` written from the shipped tokens/components
- Along the way, caught and fixed three real defects that only became visible once the finish flow forced genuine rendering/measurement instead of code review: a filter-chip row that could collapse the entire table to 0 height when a data source has too many distinct filter values; a table row that could balloon to 4-10x normal height on mobile when a field value is unusually long; and a focus-ring contrast that measured below the WCAG AA floor despite looking correct in the source

## Task Commits

1. **Task 1: Freshness badge + stale/failed-sync banner** - `5588484` (feat)
2. **Task 2: Accessibility pass — semantics, aria-live, verified contrast/focus** - `d3e51a5` (feat)
3. **[Rule 1 - Bug, found during Task 3's mobile capture] Clamp Title/Location table cells** - `3d39cb4` (fix)
4. **[Rule 1 - Bug, found via real-keyboard-Tab re-measurement] Search input/button focus ring contrast** - `b33e098` (fix)
5. **Task 3: Impeccable finish flow — detect, screenshots, review, DESIGN.md** - `59da298` (feat)

**Plan metadata:** (this commit, docs)

## Files Created/Modified

- `src/db/queries/sync-log.ts` - `KNOWN_SOURCES`, `SyncLogRow`, `STALE_THRESHOLD_MS`, `getLatestSyncPerSource()`, `isSourceStale()`
- `src/components/dashboard/freshness-badge.tsx` - "Actualizado hace Xh/Xmin" per-source badge
- `src/components/dashboard/stale-sync-banner.tsx` - icon+text stale/failed-sync warning banner, real `errorMessage` surfaced
- `src/app/page.tsx` - wired freshness badge/banner per tab; `scope="col"` on every `<th>`; `aria-live` result-count region; capped filter-chip row height; line-clamped Title/Location cells
- `src/components/ui/input.tsx` / `src/components/ui/button.tsx` - `focus-visible:ring-ring/50` -> `ring-ring` (full opacity) for WCAG AA focus-indicator contrast
- `src/components/dashboard/search-bar.tsx` - ⌘K/Ctrl+K global shortcut focuses the search input, with a visible `⌘K` hint
- `scripts/verify-freshness.ts` - ad hoc RED/GREEN check for `isSourceStale()`/`getLatestSyncPerSource()` (same no-test-framework convention as Plan 2)
- `scripts/verify-a11y.ts` - Playwright accessibility measurement harness (semantics, aria-live, keyboard walkthrough, WCAG contrast via canvas color resolution)
- `scripts/capture-finish-screenshots.ts` - desktop/mobile capture for the finish flow
- `DESIGN.md` / `.impeccable/design.json` - the project's first design-system record, written from the built world
- `.impeccable/review/desktop.png` / `mobile.png` - finish-flow evidence
- `package.json` / `pnpm-lock.yaml` - `playwright` devDependency (verified maintainer: Microsoft)

## Decisions Made

See `key-decisions` in frontmatter for full rationale on: the `selectDistinctOn` vs. raw-SQL column-mapping bug avoided, the filter-chip row height cap, the table-cell line-clamp fix, the focus-ring opacity fix, the inline (non-subagent) finish-reviewer/documenter substitution, and DESIGN.md's non-interactive authorship.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Filter-chip row could collapse the entire table to 0 height**
- **Found during:** Task 1, verifying the stale-sync banner on the Underclassmen tab
- **Issue:** Underclassmen's real ingested `category` data has 102 distinct values (long eligibility-requirement strings — a Phase 1 ingestion data-quality gap, see Issues Encountered), which pushed the unbounded `flex-wrap` filter-chip row past 1500px tall. Since the parent flex container has a fixed height (`h-dvh`), the table's `flex-1` sibling was squeezed to 0px — Playwright-measured (`getBoundingClientRect().height === 0`), not just visually estimated — making the entire Underclassmen tab invisible.
- **Fix:** Capped the chip-row container at `max-h-24` with its own `overflow-y-auto`. Every chip stays in the DOM and keyboard-reachable; only the row's own vertical growth is bounded, so the table below it always has real space regardless of how many filter values a source happens to have.
- **Files modified:** `src/app/page.tsx`
- **Verification:** Playwright before/after: TabsContent height 0px -> 738px; visual screenshot confirms real content renders.
- **Committed in:** `5588484`

**2. [Rule 1 - Bug] Table rows could balloon to 4-10x normal height on mobile**
- **Found during:** Task 3, capturing the mandatory mobile screenshot for the finish flow
- **Issue:** A real Internships row (Ernst & Young, a 13-city `Location` value) wrapped its unbounded `whitespace-normal` Location cell to 10+ lines at the mobile table's narrower column width, ballooning that single row to 257px vs. a normal 57px — visible as large, confusing blank gaps once the table scrolled horizontally off Location into view.
- **Fix:** Wrapped Title/Location cell content in an inner `line-clamp-2` `<div>` with a fixed `max-width` (not applied to the `<td>` itself, since `line-clamp`'s `display: -webkit-box` would break the cell's required `display: table-cell`). Full text remains reachable via the row's own "Ver fuente" link.
- **Files modified:** `src/app/page.tsx`
- **Verification:** Playwright screenshots at both 1440w and 390w confirm the same row now renders at normal height with "…" truncation.
- **Committed in:** `3d39cb4`

**3. [Rule 2 - Missing Critical] Search input/button focus ring below WCAG AA 3:1 contrast**
- **Found during:** Task 2's contrast measurement pass, re-confirmed 3x
- **Issue:** `input.tsx` (used by SearchBar) and `button.tsx` (shared component, not yet directly rendered elsewhere) both set `outline-none` unconditionally. Under Tailwind v4's actual semantics (`outline-none` now truly means `outline-style: none`, unlike v3's invisible-but-forced-colors-visible trick), this fully disables the app's own opaque global `:focus-visible` outline fallback, leaving `focus-visible:ring-ring/50` (a 50%-alpha box-shadow, confirmed deterministic via the compiled CSS's cascade order) as the *only* focus indicator — measured 2.06:1 against the near-black background, below the 3:1 WCAG AA floor for focus indicators.
- **Fix:** Bumped `ring-ring/50` to full-opacity `ring-ring` on both components.
- **Files modified:** `src/components/ui/input.tsx`, `src/components/ui/button.tsx`
- **Verification:** Re-measured 3x consecutively post-fix via real keyboard Tab presses: consistently 4.99:1.
- **Committed in:** `b33e098`

**4. [Rule 2 - Missing Critical, found via finish review] ⌘K command-palette shortcut never wired**
- **Found during:** Task 3's inline finish-review
- **Issue:** The locked direction contract's OWN-WORLD block names "Command-palette affordance (⌘K-style search) as the primary entry to filtering" as a signature interaction. The shipped `SearchBar` (Plan 2) was a plain always-visible `<input>` with no keyboard-summon behavior at all — the metaphor existed only in styling, never in actual behavior, with no cited product/accessibility reason on record for skipping it.
- **Fix:** Bound a global `Cmd/Ctrl+K` keydown listener that focuses the existing search input, with a visible `⌘K` hint inside it — deliberately minimal (focuses the always-visible field rather than opening a new overlay/modal) so the same OWN-WORLD line's "backed by always-visible filter chips for discoverability" half isn't diluted by a competing UI surface.
- **Files modified:** `src/components/dashboard/search-bar.tsx`
- **Verification:** Playwright keypress test confirms `Cmd/Ctrl+K` moves focus to `#dashboard-search` from anywhere on the page; re-ran the finish-reviewer's verdict pass, scored resolved, disposition recomputed to `ship`.
- **Committed in:** `59da298`

---

**Total deviations:** 4 auto-fixed (2 layout/correctness bugs found via mandatory real-rendering verification, 1 missing-critical accessibility contrast fix, 1 missing-critical signature-interaction gap found by the finish review)
**Impact on plan:** All four fixes were caught specifically *because* this plan insisted on real Playwright rendering/measurement instead of code-review-only verification — none would have been visible from reading the source. All are corrections to already-planned behavior (freshness UI, accessibility, the direction contract's own named interaction), not scope creep.

## Issues Encountered

- **React Strict Mode + Radix roving-focus-group dev-mode artifact:** in `pnpm dev`, Radix's tab-switcher `role="tablist"` container measured `tabindex="-1"` (completely unreachable by keyboard) on every load, appearing to be a severe defect. Root cause: `pnpm dev`'s React Strict Mode double-invokes effects, which interacts badly with the roving-focus-group's internal focusable-item counter. **Confirmed via the production standalone build (`node .next/standalone/server.js`) that this never happens in production** — the tablist reliably becomes keyboard-reachable there (see the "hydration timing" issue below for the real, separate, production-observed delay). Documented so a future session doesn't re-diagnose this as a real bug in dev mode.
- **`pnpm dev` / Turbopack measured 50-90 seconds per page load** in this environment (vs. ~2-3s for the identical route via the standalone production build). All verification in this plan was run against the production build for this reason — both for accuracy (dev-mode timing doesn't represent what ships) and for practicality.
- **Hydration-delayed keyboard reachability (real, production-observed, NOT fixed — architectural, out of this task's scope):** even on the production build, the tab-switcher's roving-focus group only becomes keyboard-reachable 6-13 seconds after navigation starts. Root cause: the default Internships tab renders all 16,109 rows (DISC-03's explicit "every row, active and inactive, always visible" requirement, Plan 1's design), and those rows — though static HTML with no per-row interactivity — still sit inside the client `<Tabs>` boundary's hydration walk, since React must reconcile a Fiber node for every descendant of a client component regardless of whether that descendant needs its own interactivity. This is not a keyboard trap (it self-resolves; Tab reaches the tab switcher correctly once hydration completes) but it is a measured, real delay before the tab switcher is usable. **Recommended follow-up (Rule 4 — architectural, needs a deliberate decision, not silently fixed here):** row virtualization (e.g., TanStack Virtual) for the Internships table, which would preserve DISC-03's "every row visible via scroll" requirement while removing ~16,000 Fiber nodes from the initial hydration walk. Flagged for a future plan/phase rather than fixed here since it's a genuine architecture change to Plan 1's table rendering strategy.
- **Underclassmen `category` field data-quality gap (Phase 1 ingestion, non-blocking, not this plan's job to fix):** 102 distinct raw string values, most of which are long eligibility-requirement descriptions rather than short categorical labels (e.g. `"AL resident; undergrad at eligible AL institution; financial need (FAFSA)"`). This directly caused Deviation #1 above (the filter-chip row layout collapse) — the layout fix in this plan makes the UI robust to this data shape, but the underlying data-quality issue (Phase 1's `normalize.ts` populating `category` from what should probably be a separate "eligibility" field) is unchanged and would benefit from a future Phase 1 follow-up.
- **Real live GitHub sync fired mid-session:** the app's own scheduled 2h cron (registered in every server process, including the ones started for this plan's local verification) ran a real sync against live GitHub data partway through verification, changing the Internships row count from 16,109 to 16,111 and inserting new real `sync_log` rows. This is the app working exactly as designed (DISC-04's whole premise), not a test artifact — confirmed by checking the new rows' content, which is genuine upstream data, not anything this session inserted.
- **No Agent/Task subagent-spawning tool available in this harness:** both the Impeccable finish-reviewer and documenter roles specified by the plan's environment notes ("use the impeccable-finish-reviewer and impeccable-documenter subagent types directly via the Agent tool") could not be spawned as separate subagents, since no such tool was exposed to this execution. Ran both roles inline instead, following their own documented degraded-mode fallback instructions (`reference/degraded/finish-reviewer.md`, `reference/degraded/documenter.md`), which explicitly anticipate and permit this substitution when disclosed. **Disclosed here, and flagged as `human_judgment: true` in the coverage table above** — a fresh, independently-spawned subagent review carries more evidentiary weight than the same agent stepping "out of" its own build context, and Juan may want a true independent re-review if a harness with subagent support becomes available.

## User Setup Required

None new. `GITHUB_PAT`/`SYNC_TRIGGER_SECRET`/`DATABASE_URL` production requirements are unchanged from Phase 1.

## Next Phase Readiness

- Phase 2 (Discovery UI, DISC-01 through DISC-04 + BENE-01) is now fully complete: all three plans shipped, all requirements satisfied, the visual direction is locked and documented in `DESIGN.md`.
- Phase 3 (application tracking) can build directly on the existing `page.tsx` table structure, `StatusPill`, and the now-documented design system (`DESIGN.md`) for any new inline status-editing controls — the STORY block's own promise ("Phase 3: flips a status pill inline without leaving the row") is the explicit hook for that phase's first surface.
- **Recommended but not blocking:** row virtualization for the Internships table (see "Issues Encountered" above) before Phase 3 adds more per-row interactivity (status editing), since more client-side behavior per row would compound the existing hydration-delay issue.
- **Recommended but not blocking:** an independent (subagent-spawned) finish-review pass once a harness with Agent/Task tool support is available, given this session's review ran inline/degraded.
- No blockers.

---
*Phase: 02-discovery-ui*
*Completed: 2026-09-08*

## Self-Check: PASSED

All 14 key files (2 dashboard components, 3 verification/capture scripts, DESIGN.md, design.json sidecar, 2 finish-flow screenshots, sync-log query module, page.tsx, and the 2 focus-contrast fixes) confirmed present on disk. All 5 task commit hashes (`5588484`, `d3e51a5`, `3d39cb4`, `b33e098`, `59da298`) confirmed present in `git log --oneline`.
