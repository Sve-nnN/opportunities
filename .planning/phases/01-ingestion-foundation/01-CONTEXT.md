# Phase 1: Ingestion Foundation - Context

**Gathered:** 2026-09-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Los datos de las 3 fuentes de GitHub (`SimplifyJobs/Summer2027-Internships`, `Jose-Gael-Cruz-Lopez/underclassmen-opportunities`, `Mapaor/student-benefits`) existen normalizados y actualizados en Postgres, mediante un sync programado (no fetch-por-request), sin UI de usuario en esta fase. Esta fase es la base de datos para las fases 2 (Discovery UI) y 3 (Application Tracking).

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
Fase de infraestructura pura (parsers, normalización, cache en Postgres, job de sync) — sin comportamiento visible para el usuario. Todas las decisiones de implementación quedan a criterio de Claude, siguiendo research/STACK.md, research/ARCHITECTURE.md y research/PITFALLS.md:
- Preferir `.github/scripts/listings.json` de SimplifyJobs sobre parsear el README renderizado (PITFALLS.md Pitfall 2)
- Usar `remark` + `remark-gfm` para `underclassmen-opportunities` (única fuente sin JSON alternativo)
- `JSON.parse` directo para `student-benefits/benefits.json`
- Postgres + Drizzle ORM, `external_id` estable (hash de campos de contenido, no autoincremental)
- Soft-delete (`is_active=false`) en vez de borrado físico
- Sync programado (cron, cada 1-4h) + endpoint de refresco manual, misma función subyacente
- GitHub PAT de solo lectura, fine-scoped, con expiración, como variable de entorno — nunca fetch sin autenticar en producción
- Tabla `sync_log` registrando timestamp, conteo de filas y éxito/fallo por fuente
- Verificar durante esta fase (due-diligence, no bloqueante): si `Summer2027-Internships` expone deadlines parseables de forma confiable, y licencia/atribución de las 3 fuentes (ver STATE.md Blockers/Concerns)

</decisions>

<code_context>
## Existing Code Insights

Proyecto greenfield, sin código existente. Repositorio recién inicializado (`git init`), sin `package.json` aún. La Fase 1 incluye el scaffold inicial de Next.js (App Router, TypeScript, `output: 'standalone'`) ya que ninguna fase anterior lo hizo.

### Reusable Assets
Ninguno — primer código del proyecto.

### Established Patterns
Ninguno aún — esta fase establece los patrones (estructura `ingestion/`, `db/`, ver research/ARCHITECTURE.md Recommended Project Structure).

### Integration Points
N/A — no hay UI ni API previa a la que integrarse.

</code_context>

<specifics>
## Specific Ideas

Ninguna idea específica adicional — research/SUMMARY.md y research/ARCHITECTURE.md ya especifican la estructura recomendada (`ingestion/sources/*`, `ingestion/normalize.ts`, `ingestion/sync.ts`, `db/schema.ts`, `jobs/scheduled-sync.ts`). Seguir esa estructura tal cual.

</specifics>

<deferred>
## Deferred Ideas

- Redis como cache en vez de tabla Postgres (research/STACK.md — solo si crece el volumen/número de fuentes, no v1)
- Endpoints de API para servir los datos (`api/opportunities.ts`, etc.) — pertenecen a la Fase 2/3, esta fase solo deja los datos cacheados en Postgres

</deferred>
