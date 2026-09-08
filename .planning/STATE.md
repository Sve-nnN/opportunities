---
gsd_state_version: 1.0
current_phase: 3
current_phase_name: Application Tracking
status: in_progress
stopped_at: Completed 03-01-PLAN.md (applications queries/Server Action/StatusDropdown)
last_updated: "2026-09-08T04:00:00.000Z"
last_activity: 2026-09-08
last_activity_desc: Phase 3 Plan 1 complete — status tracking end-to-end (TRACK-01, TRACK-04, TRACK-03 partial)
state_head: 243023f
progress:
  total_phases: 4
  completed_phases: 2
  total_plans: 7
  completed_plans: 6
  percent: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-07)

**Core value:** Juan abre una sola página y ve, siempre actualizado, qué internships/programas le sirven hoy y qué beneficios .edu no está aprovechando — sin tener que revisar manualmente varios repos de GitHub.
**Current focus:** Phase 3 — Application Tracking

## Current Position

Phase: 3 — Application Tracking
Plan: 1/2 complete
Status: In progress
Last activity: 2026-09-08 — Plan 1 (applications queries/Server Action/StatusDropdown) complete

Progress: [█████░░░░░] 50%

## Performance Metrics

**Velocity:**

- Total plans completed: 5
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 2 | - | - |
| 2 | 3 | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01 P01 | 25min | 3 tasks | 33 files |
| Phase 01 P02 | 35min | 3 tasks | 7 files |
| Phase 02 P01 | 40min | 3 tasks | 15 files |
| Phase 02 P02 | ~20min | 3 tasks | 9 files |
| Phase 02 P03 | ~2h | 3 tasks | 16 files |
| Phase 03 P01 | ~1h | 3 tasks | 11 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Fetch en vivo de las 3 fuentes vía sync programado (no fetch-per-request), cacheado en Postgres
- Tracking de postulaciones incluido desde v1, persistido en DB (no localStorage) para sync multi-dispositivo
- Deploy en hosting propio (Dokploy/Hetzner) + Cloudflare, no Vercel
- [Phase 1]: student-benefits.json usa el campo requiresCampus (no campusRequired como asumía research); normalize.ts lo mapea defensivamente
- [Phase 1]: Sync tracer corrido sin GITHUB_PAT (aun no disponible) contra raw.githubusercontent.com sin autenticar, solo para esta corrida de dev; produccion debe fijar GITHUB_PAT antes de syncs frecuentes
- [Phase 1]: external_id de summer2027-internships incluye url ademas de company+title+locations (colision real detectada: 1867/16109 filas)
- [Phase 1]: underclassmen-opportunities tiene 9 tablas GFM con headers distintos, no una sola tabla - mapeo de columnas por alias de header en runtime
- [Phase 1]: underclassmen-opportunities si expone senal open/closed real (badges Status) - is_active derivado de esa senal, no hardcoded true
- [Phase 2]: shadcn CLI now installs radix-ui/cn/tw-animate-css instead of individual @radix-ui/react-*+clsx+tailwind-merge packages -- verified legitimacy on npmjs.com before proceeding
- [Phase 2]: Locked visual direction (near-black #0B0B0D, violet #7C6CF6 accent) implemented as CSS custom properties directly on :root, no light/dark toggle since the app is always-dark
- [Phase 2]: dashboard-tabs.tsx client wrapper added to mirror active tab into a tab URL param so filters can be scoped server-side to the active tab
- [Phase 2]: No test framework installed for the tdd=true task; used an ad hoc tsx script (scripts/verify-filters.ts) against live Postgres, matching Phase 1's established verification convention
- [Phase 2]: getLatestSyncPerSource() uses Drizzle's typed selectDistinctOn, never raw sql DISTINCT ON, to avoid silently mismatching camelCase schema field names against Postgres' raw snake_case column output
- [Phase 2]: Capped the filter-chips row height (max-h-24) after Playwright measurement showed an unbounded flex-wrap chip row (Underclassmen's 102 raw category values) could collapse the entire table to 0 height
- [Phase 2]: All accessibility/visual verification in Phase 2 Plan 3 ran against the production standalone build (node .next/standalone/server.js), never pnpm dev — dev mode showed a React Strict Mode double-effect artifact and 50-90s page loads that don't reproduce in production
- [Phase 2]: Impeccable finish-reviewer/documenter roles ran inline per their degraded-mode fallback (no Agent/Task subagent tool available in this harness) — disclosed in 02-03-SUMMARY.md; a true independent re-review is recommended when available
- [Phase 3 P1]: Added a UNIQUE constraint on applications.opportunity_external_id (migration 0001) as a prerequisite for onConflictDoUpdate — column existed schema-only since Phase 1 with no constraint
- [Phase 3 P1]: Moved ApplicationStatus/APPLICATION_STATUSES into src/lib/application-status.ts (no `pg` import) after the initial build broke — the client StatusDropdown component was pulling the Postgres driver into the browser bundle by importing types from db/queries/applications.ts, which imports db/client.ts (pg)
- [Phase 3 P1]: Removed shadcn's default shadow-md from select.tsx's SelectContent, replaced with border-border — DESIGN.md's Flat-By-Default Rule forbids any box-shadow in this system
- [Phase 3 P1]: "Guardado/me interesa" implemented purely as a 6th value of the same `status` text column (not the pre-existing unused `isSaved` boolean column) — confirmed via live Postgres that setting status='saved' never touches opportunities.is_active nor applications.is_saved

### Pending Todos

None yet.

### Blockers/Concerns

- Verificar en Phase 1 si `Summer2027-Internships` expone datos de deadline parseables; si no, se descarta esa feature del roadmap en vez de arrastrarla como deuda (research/SUMMARY.md)
- Verificar licencia/atribución de las 3 fuentes de GitHub durante Phase 1 (riesgo MEDIUM, no bloqueante)
- ⚠️ [Phase 2] Tabla de Internships (16,109 filas) sin virtualización — tab-switcher tarda 6-13s en volverse alcanzable por teclado en producción. No es trap (se resuelve solo), pero Phase 3 agrega controles interactivos por fila a esta misma tabla — considerar TanStack Virtual antes o durante Phase 3
- ⚠️ [Phase 2] Impeccable finish-reviewer/documenter corrieron en modo degradado (inline, sin subagentes) — recomendable una re-revisión independiente cuando el harness lo soporte

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| *(none)* | | | | |

## Session Continuity

Last session: 2026-09-08T04:00:00.000Z
Stopped at: Completed 03-01-PLAN.md (applications queries/Server Action/StatusDropdown) — ready for 03-02-PLAN.md (notes autosave + virtualization + accessibility pass)
Resume file: None
</content>
