---
phase: 02-discovery-ui
plan: 01
subsystem: ui
tags: [nextjs, shadcn-ui, tailwind-v4, radix, drizzle, postgres, a11y, next-font]

requires:
  - phase: 01-ingestion-foundation
    provides: Drizzle 4-table Postgres schema (opportunities, benefits, applications, sync_log), fully populated by the 3-source sync (3,083 active + 13,026 inactive summer2027-internships, 109 active underclassmen-opportunities, 42 student-benefits)
provides:
  - shadcn/ui initialized (Radix base, Tailwind v4 CSS-first) with locked visual theme (near-black #0B0B0D ground, #7C6CF6 violet accent) as CSS custom properties, no hardcoded hex in components
  - Self-hosted Inter (sans) + IBM Plex Mono (mono, tabular-nums) via next/font/google — zero runtime Google Fonts CDN calls
  - src/db/queries/opportunities.ts (listOpportunities) and src/db/queries/benefits.ts (listBenefits) — read-only Drizzle query builder functions, no raw SQL
  - src/app/page.tsx: real 3-tab dashboard (Internships / Underclassmen / Beneficios .edu) reading live Postgres via Server Components, no client-side fetch
  - src/components/dashboard/status-pill.tsx: icon+text open/closed indicator, never color-only
affects: [phase-2-discovery-ui-plan-2, phase-2-discovery-ui-plan-3, phase-3-application-tracking]

actuals:
  tokens: 9200
  tasks: 3
  commits: 3

tech-stack:
  added: [shadcn@4.21.0 (CLI, dev-time codegen only), radix-ui@1.6.7, cn@0.2.6, class-variance-authority@0.7.1, lucide-react@1.42.0, tw-animate-css@1.4.0]
  patterns:
    - "Locked visual direction lives entirely in globals.css CSS custom properties (@theme + :root) — component files never hardcode a hex value, they reference bg-background/text-primary/etc. utility classes"
    - "page.tsx is a single async Server Component: Promise.all([listOpportunities(...), listOpportunities(...), listBenefits()]) once per request, no client-side data fetching anywhere on this page (export const dynamic = 'force-dynamic' since the page must always reflect the latest sync, DISC-01)"
    - "Tab label shows the active-row count (the headline 'what's open today' number); the table underneath always renders every row, active and inactive, via <StatusPill> (DISC-03) — count is a summary, never a filter"
    - "Inline dense-table rendering (OpportunitiesTable, BenefitsTable as local functions in page.tsx) rather than a separate component file, since only 2 near-identical opportunities-table callers exist so far (plan's own stated threshold before extracting)"

key-files:
  created:
    - src/db/queries/opportunities.ts
    - src/db/queries/benefits.ts
    - src/components/dashboard/status-pill.tsx
    - src/components/ui/table.tsx
    - src/components/ui/tabs.tsx
    - src/components/ui/badge.tsx
    - src/components/ui/button.tsx
    - src/components/ui/input.tsx
    - src/lib/utils.ts
    - components.json
  modified:
    - src/app/globals.css
    - src/app/layout.tsx
    - src/app/page.tsx
    - package.json
    - pnpm-lock.yaml

key-decisions:
  - "shadcn CLI (v4.21.0, matching research/STACK.md's pinned version) now ships a newer architecture than STACK.md assumed: a 'radix-nova' preset installing the radix-ui meta-package + a small cn helper instead of per-component @radix-ui/react-tabs / @radix-ui/react-slot / clsx / tailwind-merge packages. Verified all substituted packages on the npm registry before proceeding (radix-ui maintained by a known Radix/WorkOS engineer, cn maintained by the shadcn author himself as a documented clsx+tailwind-merge drop-in, tw-animate-css is the standard Tailwind v4 replacement for tailwindcss-animate) — same intended functionality, no scope change."
  - "Selected the Radix base UI library (-b radix) during shadcn init specifically to match the plan's pre-approved package list (@radix-ui/react-tabs, @radix-ui/react-slot), even though shadcn's newer default is 'Base UI'."
  - "Tab label shows the ACTIVE row count, not the raw array length, matching the plan's own illustrative example ('Internships (3,083)') — the table body still renders all rows including inactive ones, per DISC-03."
  - "Customized shadcn's generated tabs.tsx active-tab indicator (underline + label color) to use the locked violet accent instead of the default foreground color, since 'active tab' is explicitly named as one of the three places the single accent color is reserved for in the direction contract."
  - "Made external 'Ver fuente' links underlined by default (not hover-only) — A11Y.md (hard project constraint) requires interactive elements to never rely on color alone for identification."
  - "Used next/font/google (self-hosts at runtime, fetches at Docker build time) instead of hand-vendoring font files, per the environment note's explicit guidance — documented as a Phase 4 Docker-build network requirement below."

requirements-completed: [DISC-01, DISC-03, BENE-01]

coverage:
  - id: D1
    description: "page.tsx renders a real dense table of live summer2027-internships data (3,083 active + 13,026 inactive) on the locked near-black/violet visual system, replacing the create-next-app placeholder"
    requirement: "DISC-01"
    verification:
      - kind: integration
        ref: "pnpm build (produces .next/standalone/server.js) + pnpm dev, curl http://localhost:3000/ against live Postgres — verified table-row count (16,110 incl. header), tab count (3,083), --background:#0b0b0d and --primary:#7c6cf6 present in generated CSS, self-hosted /_next/static/media/*.woff2 fonts with zero fonts.googleapis.com/fonts.gstatic.com references"
        status: pass
    human_judgment: false
  - id: D2
    description: "Underclassmen and Beneficios .edu tabs exist, keyboard-navigable (native Radix role=tablist/tab/tabpanel), each showing real data from their own source"
    requirement: "DISC-01"
    verification:
      - kind: integration
        ref: "curl http://localhost:3000/ — role=\"tablist\"/role=\"tab\" present with aria-selected/aria-controls wiring; tab labels render >109< (underclassmen active) and >42< (benefits active) matching Phase 1's live row counts exactly"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every opportunity/benefit row shows an icon+text status pill (never color-only) and a working external link with target=_blank rel=noopener noreferrer"
    requirement: "DISC-03"
    verification:
      - kind: integration
        ref: "Live HTML scrape: 6,166/2=3,083 'Abierto' + 26,052/2=13,026 'Cerrado' pill occurrences (RSC payload doubles literal text) exactly matching the DB's active/inactive split for summer2027-internships; StatusPill always renders both a lucide icon (aria-hidden) and the text label"
        status: pass
    human_judgment: false
  - id: D4
    description: "Beneficios .edu tab shows title, description, and all tags (as chips) for every one of the 42 student-benefits rows, no expand-to-see-more"
    requirement: "BENE-01"
    verification:
      - kind: integration
        ref: "Live query confirms listBenefits() returns 42 rows; BenefitsTable renders title/description/tags(Badge chips)/status columns directly, verified 'JetBrains Student License' + its tags render in the initial table markup"
        status: pass
    human_judgment: false
  - id: D5
    description: "Visual direction matches the locked contract: near-black ground, single violet accent reserved for active tab/focus/primary actions, self-hosted (not Google-CDN-at-runtime) fonts, tabular-nums counts, deliberate compact type scale"
    verification: []
    human_judgment: true
    rationale: "Automated checks confirm the CSS custom property values and font self-hosting are correctly wired, but whether the rendered result actually *reads* as the locked 'command-driven data tool' direction (density, type-scale discipline, restrained accent usage) is a visual judgment call best made by looking at the running app, not grep output."

duration: ~40min
completed: 2026-09-07
status: complete
---

# Phase 2 Plan 1: shadcn/ui Dashboard Scaffold + Internships/Underclassmen/Beneficios Tabs Summary

**shadcn/ui (Radix base) initialized with the locked near-black/violet theme and self-hosted Inter + IBM Plex Mono fonts, plus a real 3-tab Server Component dashboard reading live Postgres data (3,083 internships, 109 underclassmen opportunities, 42 benefits) through two new Drizzle read-query modules**

## Performance

- **Duration:** ~40 min (approximate — exact start timestamp was not captured at session start)
- **Completed:** 2026-09-07T23:17:43Z
- **Tasks:** 3 (package-legitimacy checkpoint pre-approved per environment notes, not re-executed; tracer + expansion tasks executed and verified)
- **Files modified:** 15 (10 created, 5 modified)

## Accomplishments
- shadcn/ui initialized with the Radix component base (matching the plan's pre-approved `@radix-ui/react-tabs`/`@radix-ui/react-slot` packages) and Tailwind v4's CSS-first config — `table`, `tabs`, `badge`, `button`, `input` components added
- Locked visual direction implemented as CSS custom properties in `globals.css`: `#0B0B0D` background, `#7C6CF6` violet accent (contrast-checked ~5:1 against the background, passes WCAG AA), warm off-white ink, a deliberate compact type scale, and themed browser surfaces (selection, focus ring, scrollbar)
- Inter + IBM Plex Mono self-hosted via `next/font/google` — verified zero `fonts.googleapis.com`/`fonts.gstatic.com` calls in the rendered page, fonts served from `/_next/static/media/*.woff2`
- `listOpportunities(source)` and `listBenefits()` read-query functions, both plain Drizzle query builder (no raw SQL), both including active AND inactive rows per DISC-03
- `page.tsx`: single async Server Component with `Promise.all` fetching all 3 tabs' data once per request, zero client-side fetching, `export const dynamic = 'force-dynamic'` so the page always reflects the latest 2h sync
- `<StatusPill>`: icon (lucide, `aria-hidden`) + text ("Abierto"/"Cerrado") always both rendered, satisfying the never-color-alone A11Y requirement
- Live-verified against the real dev Postgres (127.0.0.1:5434): exact row counts for all 3 sources match Phase 1's ingested data (3,083/13,026 internships, 109 underclassmen, 42 benefits)

## Task Commits

1. **Task 2: shadcn/ui + self-hosted theme/fonts + read queries + Internships tab tracer** - `4b30b2a` (feat)
2. **Task 3: Benefits query + Underclassmen/Benefits tabs** - `1f3b96d` (feat)
3. **A11Y fix (Rule 2, found while reviewing Task 3's output before summary)** - `6de607a` (fix)

_Task 1 (package-legitimacy checkpoint) was pre-approved per the environment notes — no commit, no re-execution._

**Plan metadata:** (this commit, docs)

## Files Created/Modified
- `src/app/globals.css` - Locked theme as CSS custom properties, compact type scale, themed browser surfaces
- `src/app/layout.tsx` - Self-hosted Inter/IBM Plex Mono via `next/font/google`, `dark` class on `<html>` (app is always-dark, no toggle)
- `src/app/page.tsx` - Full 3-tab dashboard, Server Component, live Postgres data
- `src/db/queries/opportunities.ts` - `listOpportunities(source)`
- `src/db/queries/benefits.ts` - `listBenefits()`
- `src/components/dashboard/status-pill.tsx` - Icon+text open/closed indicator
- `src/components/ui/table.tsx`, `tabs.tsx`, `badge.tsx`, `button.tsx`, `input.tsx` - shadcn-generated primitives (`tabs.tsx` hand-edited for the violet active-tab accent)
- `src/lib/utils.ts`, `components.json` - shadcn scaffolding (`cn` re-export, CLI config)
- `package.json` / `pnpm-lock.yaml` - shadcn/Radix/lucide/cva/cn/tw-animate-css dependencies

## Decisions Made
- Verified the shadcn CLI's actual (newer) package substitutions against npmjs.com before proceeding, since they differed by name from the plan's checkpoint-approved list — see `key-decisions` in frontmatter for the full reasoning per package.
- Chose the active-count (not total-row-count) for tab labels to match the plan's own stated example number, while keeping the table body showing every row (DISC-03 is about visibility, not the summary count).
- Kept the Internships/Underclassmen table rendering inline in `page.tsx` rather than extracting a shared component yet, per the plan's own "~3 near-identical copies" threshold (currently 2).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] shadcn CLI installs different package names than the plan's checkpoint-approved list**
- **Found during:** Task 2, running `pnpm dlx shadcn@latest init`
- **Issue:** The plan's pre-approved package-legitimacy list named `clsx`, `tailwind-merge`, `@radix-ui/react-tabs`, `@radix-ui/react-slot`. The installed shadcn CLI (still `shadcn@4.21.0`, matching STACK.md's pinned version) has since moved to a different architecture: a `radix-ui` meta-package (bundling Radix primitives), a `cn` helper package (drop-in `clsx`+`tailwind-merge` replacement), and `tw-animate-css` (Tailwind v4's `tailwindcss-animate` successor) — none of which appear on the originally-approved list by name.
- **Fix:** Ran `npm view` against each newly-installed package (`radix-ui`, `cn`, `tw-animate-css`, plus re-confirming `lucide-react`, `class-variance-authority`, `shadcn`) to check maintainer identity and description before proceeding. `radix-ui` is maintained by a known Radix/WorkOS engineer; `cn` is maintained by the `shadcn` npm account itself and is explicitly described as a `clsx`+`tailwind-merge` replacement; `tw-animate-css` is the documented, widely-adopted Tailwind v4 migration path for `tailwindcss-animate`. Proceeded with the CLI's actual output rather than fighting it into installing packages it no longer uses.
- **Files modified:** `package.json`, `pnpm-lock.yaml` (dependency list)
- **Verification:** `npm view <pkg> maintainers.0.name` for each package, cross-checked against known identities.
- **Committed in:** `4b30b2a`

**2. [Rule 2 - Missing Critical] External source links relied on color alone by default**
- **Found during:** Reviewing Task 3's rendered output before writing this summary
- **Issue:** "Ver fuente" links used `text-primary` (violet) with `hover:underline`/`focus-visible:underline` — meaning in their resting (non-hovered, non-focused) state, the only visual signal distinguishing them as links was color, which A11Y.md (hard project constraint, non-negotiable per CLAUDE.md) explicitly disallows.
- **Fix:** Changed to a static `underline underline-offset-4` applied unconditionally, so the link is identifiable without color in every state.
- **Files modified:** `src/app/page.tsx`
- **Verification:** `pnpm exec tsc --noEmit && pnpm build` clean; live curl confirmed `underline underline-offset-4` present in the rendered anchor markup.
- **Committed in:** `6de607a`

---

**Total deviations:** 2 auto-fixed (1 blocking/tooling substitution, 1 missing-critical accessibility fix)
**Impact on plan:** Neither changed the plan's architecture or scope — the package substitution delivers identical functionality under different names, and the A11Y fix hardens an already-planned feature (the external link) to actually satisfy the project's stated non-negotiable accessibility constraint. No scope creep.

## Issues Encountered
- Could not write `.env.local` in this worktree (same dotenv permission-deny rule Phase 1 Plan 2 hit) — used inline `DATABASE_URL=... pnpm build`/`pnpm dev` environment-variable prefixes for every verification command instead. No production code path changed.
- `pnpm exec tsc --noEmit` fails with `Cannot find name 'LayoutProps'` in a completely fresh worktree checkout until `pnpm build` (or `pnpm dev`) has run once — Next.js 16's typed-routes ambient types (`.next/types/`) don't exist yet in a clean checkout. Not a real type error: running `pnpm build` once (which the plan's own verify step does, right after `tsc --noEmit`) generates the types and a subsequent `tsc --noEmit` passes clean. Documented here since it looks alarming on a truly fresh checkout; no code fix needed.
- The initial implementation showed the *total* row count (active + inactive) in each tab label instead of the active-only count the plan's own example number (`Internships (3,083)`) implied. Caught during live verification before committing Task 3's final state; fixed with a small `countActive()` helper.

## User Setup Required
None new. `GITHUB_PAT`/`SYNC_TRIGGER_SECRET`/`DATABASE_URL` production requirements are unchanged from Phase 1 (see `01-01-SUMMARY.md`).

**Phase 4 note (Docker build):** `next/font/google` self-hosts fonts at **runtime** (the deployed container makes zero calls to `fonts.googleapis.com`/`fonts.gstatic.com`) but fetches the font files at **build time**. The Dokploy Docker build stage must have network access for `pnpm build`/`next build` to succeed — this is already true for the planned Dokploy-on-VPS deploy, but is worth calling out explicitly when Phase 4 writes the final Dockerfile/CI pipeline.

## Next Phase Readiness
- Plan 2 (search/filters) and Plan 3 (freshness badges, a11y/finish pass) can build directly on `page.tsx`'s 3-tab structure, `listOpportunities`/`listBenefits`, and the locked theme tokens — no rework needed.
- The `deemphasized` prop on the shared `OpportunitiesTable` function is a minimal, working implementation of "Underclassmen deprioritized but not hidden" (02-CONTEXT.md); Plan 2/3 can extend it further (e.g. sort order, additional visual treatment) without restructuring.
- `sync_log`-backed freshness badges (DISC-04, deferred to Plan 3 per 02-CONTEXT.md) are not yet built — `sync_log` table and its query pattern already exist from Phase 1 (`src/db/queries/sync-log.ts`), so Plan 3 has a direct precedent to follow.
- No blockers.

---
*Phase: 02-discovery-ui*
*Completed: 2026-09-07*

## Self-Check: PASSED

All 7 key files (2 read-query modules, status-pill component, page.tsx, layout.tsx, globals.css, components.json) confirmed present on disk. All 3 task commit hashes (`4b30b2a`, `1f3b96d`, `6de607a`) confirmed present in `git log --oneline --all`.
