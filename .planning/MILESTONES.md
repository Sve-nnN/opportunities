# Milestones

## v1.0 MVP (Shipped: 2026-09-08)

**Phases completed:** 4 phases, 12 plans, 23 tasks

**Key accomplishments:**

- Next.js 16 standalone-Docker scaffold, full 4-table Drizzle/Postgres schema, and a live end-to-end student-benefits sync (fetch → zod validate → sha1 external_id → upsert → soft-delete → sync_log) triggerable by cron or a secret-gated POST /api/sync
- Extended the Plan 1 ingestion architecture to `SimplifyJobs/Summer2027-Internships` (listings.json, 16,109 rows) and `Jose-Gael-Cruz-Lopez/underclassmen-opportunities` (9 GFM tables via remark-gfm, 109 rows), with `runSync()` now orchestrating all 3 sources in parallel and per-source-scoped soft-delete
- shadcn/ui (Radix base) initialized with the locked near-black/violet theme and self-hosted Inter + IBM Plex Mono fonts, plus a real 3-tab Server Component dashboard reading live Postgres data (3,083 internships, 109 underclassmen opportunities, 42 benefits) through two new Drizzle read-query modules
- Extended Plan 1's read-query layer with search/category/roleType/status filtering (Drizzle and()/or()/eq()/ilike(), never raw SQL), wired it to command-palette-style URL-driven search + accessible filter chips scoped per active tab, and replaced all loading states with a layout-matched skeleton — all verified end-to-end against the live 16,109-row dev Postgres
- Real per-tab "synced Xh ago" freshness badges and stale/failed-sync warning banners wired to live `sync_log` data, a measured (not eyeballed) WCAG AA accessibility pass run via Playwright against the production build, and a completed Impeccable finish flow (detector, screenshots, finish-review, DESIGN.md) that caught and fixed three real defects — a layout-collapsing filter-chip overflow, a table-row-ballooning mobile wrap bug, and a below-floor focus-ring contrast — none of which were visible from code review alone
- Applications queries + Zod-validated Server Action + a shadcn-select-based icon+text StatusDropdown, wired into a new "Postulación" column on Internships/Underclassmen, upserting by `opportunity_external_id` against a newly-constrained UNIQUE column — verified end-to-end against live dev Postgres including a real full-page-reload readback
- Debounced-autosave notes popover (fill/outline icon, Zod-validated Server Action) plus a `@tanstack/react-virtual` refactor of the 16,109+-row Internships/Underclassmen table with roving tabindex, closing two live bugs (tbody row-height explosion, a pre-existing Server-Action focus-loss) discovered by the new Playwright keyboard walkthrough that verify-a11y.ts now runs on every future change
- Complete
- Complete
- Complete
- Complete
- Internships/Underclassmen/Benefits tabs now query Postgres with LIMIT/OFFSET (100 rows/page) instead of fetching the full table — Internships' RSC payload dropped from ~17MB/14s to ~180KB/40-170ms warm.

---
