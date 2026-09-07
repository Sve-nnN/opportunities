---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: ["src/app/layout.tsx"]
---

## Scope

Discovery UI (Phase 2): unified dashboard at `src/app/page.tsx` — tabs for Internships / Underclassmen Programs / Benefits, each a dense filterable table over live-synced Postgres data. Operate mode. This world also governs Phase 3 (application tracking controls added to the same tables) and any future surface.

Audience: Juan, sole user, CS engineering student, daily GitHub/dev-tool user. Job: scan hundreds of rows fast, filter, and (Phase 3) mark status. Constraints: strict A11Y.md compliance (WCAG AA, full keyboard nav, never color-only state), real Postgres data only (no placeholder content), self-hosted deploy (no external font/CDN dependency beyond the approved allowlist-free local stack — use system/self-hosted fonts, not Google Fonts CDN, since this ships standalone Docker).

## Direction contract

THESIS: A command-driven data tool, not a marketing dashboard — density and speed win over decoration; every row is scannable and every state is legible without color.

OWN-WORLD: Near-black ground (`#0B0B0D`) with a single saturated violet accent (`#7C6CF6`) reserved for the active tab, focus rings, and primary actions; body ink is a warm off-white/gray scale, never pure white-on-black. Geometric sans (self-hosted, e.g. Inter or IBM Plex Sans — no external CDN) at a compact scale; monospace (IBM Plex Mono or JetBrains Mono, self-hosted) for counts, timestamps, and external_id-adjacent metadata. Status conveyed via pill badges with both icon + text label (never color alone, per A11Y). Command-palette affordance (⌘K-style search) as the primary entry to filtering, backed by always-visible filter chips for discoverability.

STORY: Juan opens the dashboard and immediately sees three tabs with live counts and a "synced Xh ago" timestamp per source; he searches or filters, scans a dense table, and (Phase 3) flips a status pill inline without leaving the row.

FIRST VIEWPORT: Top bar — tab switcher (Internships / Underclassmen / Benefits) left, global search + filter chips center, sync-freshness badge per active tab right. Below: a dense data table filling the remaining viewport, sticky header row, zebra-free (border-based) row separation, status/closed indicator as leading icon+pill in each row, no sidebar (single-page tool, no need for nav chrome).

FORM: Direction 5 of 7 grounded candidates (GitHub PR/Issues list, VS Code explorer+diagnostics, CI/CD status dashboard, terminal/CLI log, **Linear/Kanban dev-tool app** [assigned], academic registrar table, Bloomberg-style trading terminal). Seed key: a1815e08. Raise from declined challenger `variable-font-specimen`: commit to measured, precise type-scale discipline (deliberate cap-height/line-height ratios) rather than default Tailwind text sizes, since the dense table lives or dies on typographic precision. Raise from competitive challenger `broadcast-programming-teletext-service`: state is always revealed via explicit icon+label, never color alone, and tabular numerals (`font-variant-numeric: tabular-nums`) for all counts/timestamps so columns of numbers align.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
