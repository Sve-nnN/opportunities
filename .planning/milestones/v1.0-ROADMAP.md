# Roadmap: Opportunities Hub

## Overview

Juan necesita una sola página que agregue en vivo internships, programas underclassmen y beneficios .edu desde tres repos públicos de GitHub, y que le permita trackear el estado de sus postulaciones desde cualquier dispositivo. El camino va de adentro hacia afuera: primero se construye la capa de ingestión (parsers + normalización + cache en Postgres), porque tanto la vista de descubrimiento como el tracking dependen de que exista un esquema estable con `external_id`. Sobre esa base se construye la UI de descubrimiento (listado, búsqueda, filtros), luego el tracking de postulaciones (que reutiliza la misma base de datos), y por último el despliegue en la infraestructura propia de Juan (Dokploy + Cloudflare).

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: Ingestion Foundation** - Parsers, normalización y cache en Postgres para las 3 fuentes, con sync programado y `external_id` estable (completed 2026-09-07)
- [x] **Phase 2: Discovery UI** - Listado unificado, búsqueda/filtros y catálogo de beneficios sobre la capa de cache (completed 2026-09-07)
- [x] **Phase 3: Application Tracking** - Estado y notas de postulaciones persistidos en DB, sincronizados entre dispositivos (completed 2026-09-07)
- [x] **Phase 4: Deploy** - App en producción vía Dokploy/Hetzner con subdominio de juan-tech.com y HTTPS funcionando (completed 2026-09-08)

## Phase Details

### Phase 1: Ingestion Foundation

**Mode:** mvp
**Goal**: Los datos de las 3 fuentes de GitHub existen normalizados y actualizados en Postgres, sin depender de fetch-por-request
**Depends on**: Nothing (first phase)
**Requirements**: ING-01, ING-02, ING-03, ING-04, ING-05, ING-06
**Success Criteria** (what must be TRUE):

  1. Los datos de `Summer2027-Internships`, `underclassmen-opportunities` y `student-benefits` están normalizados en un esquema común dentro de Postgres
  2. Un sync programado (con opción de reintento manual) actualiza los datos periódicamente, sin fetch en cada request
  3. Cada registro tiene un `external_id` estable que sobrevive entre syncs
  4. Los registros que desaparecen de la fuente quedan marcados inactivos, nunca se borran

**Plans**: 2/2 plans executed

- [x] 01-01-PLAN.md — Next.js scaffold + Docker + Drizzle schema + tracer end-to-end sync for student-benefits (fetch, normalize, external_id, soft-delete, sync_log, cron + manual trigger)
- [x] 01-02-PLAN.md — Expand ingestion to Summer2027-Internships (listings.json) and underclassmen-opportunities (remark-gfm), orchestrated with per-source error isolation

### Phase 2: Discovery UI

**Mode:** mvp
**Goal**: Juan puede ver y filtrar, en una sola página, todas las oportunidades y beneficios reflejando el último sync
**Depends on**: Phase 1
**Requirements**: DISC-01, DISC-02, DISC-03, DISC-04, BENE-01
**Success Criteria** (what must be TRUE):

  1. Juan ve un listado unificado de internships, programas underclassmen y beneficios que refleja siempre el último sync
  2. Juan puede filtrar/buscar por categoría, tipo de rol y estado (abierto/cerrado)
  3. Cada listing muestra si está cerrado/inactivo, con enlace directo a la fuente/aplicación
  4. El dashboard muestra cuándo fue la última sincronización por fuente
  5. Juan ve el catálogo completo de beneficios .edu (título, descripción, tags)

**Plans**: 3/3 plans executed

Plans:

- [x] 02-01-PLAN.md — shadcn/ui + self-hosted theme/fonts + read queries + Internships/Underclassmen/Benefits tabs tracer
- [x] 02-02-PLAN.md — Filterable queries + search bar + filter chips + skeleton loaders
- [x] 02-03-PLAN.md — Sync freshness badge/banner + accessibility pass + Impeccable finish flow (DESIGN.md)

**UI hint**: yes

### Phase 3: Application Tracking

**Mode:** mvp
**Goal**: Juan puede trackear el estado real de sus postulaciones desde cualquier dispositivo, sin depender de localStorage
**Depends on**: Phase 1
**Requirements**: TRACK-01, TRACK-02, TRACK-03, TRACK-04
**Success Criteria** (what must be TRUE):

  1. Juan puede marcar el estado de una postulación (por aplicar / aplicado / en proceso / rechazado / aceptado)
  2. Juan puede agregar notas libres a una postulación trackeada
  3. El estado y las notas persisten en base de datos y se ven igual desde cualquier dispositivo
  4. Juan puede marcar una oportunidad como "guardada/me interesa" sin que cuente como "aplicado"

**Plans**: 2/2 plans executed

Plans:

- [x] 03-01-PLAN.md — applications queries/Server Actions + status dropdown (icon+texto) wired into Internships/Underclassmen, incluye "guardado/me interesa"
- [x] 03-02-PLAN.md — notas con autosave debounced + refactor de virtualización (TanStack Virtual) de la tabla + pasada de accesibilidad

**UI hint**: yes

### Phase 4: Deploy

**Mode:** mvp
**Goal**: La app corre en producción en la infraestructura propia de Juan, accesible con HTTPS en un subdominio de juan-tech.com
**Depends on**: Phase 2, Phase 3
**Requirements**: DEPLOY-01, DEPLOY-02, DEPLOY-03
**Success Criteria** (what must be TRUE):

  1. La app corre como contenedor Docker desplegado vía la API de Dokploy en el hosting propio de Juan
  2. La app es accesible en un subdominio de `juan-tech.com` con HTTPS funcionando (Cloudflare Full-strict + Let's Encrypt)
  3. Los secretos (PAT de GitHub, credenciales de DB) están configurados como variables de entorno en Dokploy, con el PAT de solo lectura y con expiración

**Plans**: 5/5 plans executed

Plans:

- [x] 04-05-PLAN.md

- [x] 04-01-PLAN.md — Verify Docker build (static assets), push repo to GitHub, create Dokploy project/application wired to it (buildType=dockerfile)
- [x] 04-02-PLAN.md — Apply production migrations via SSH tunnel, set DATABASE_URL/GITHUB_PAT/SYNC_TRIGGER_SECRET as Dokploy env vars
- [x] 04-03-PLAN.md — Trigger deploy, confirm build success and non-crash-looping runtime
- [x] 04-04-PLAN.md — Configure opportunities.juan-tech.com domain + Let's Encrypt SSL, final human-verify checkpoint

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Ingestion Foundation | 2/2 | Complete    | 2026-09-07 |
| 2. Discovery UI | 3/3 | Complete    | 2026-09-07 |
| 3. Application Tracking | 2/2 | Complete    | 2026-09-07 |
| 4. Deploy | 5/5 | In Progress|  |
</content>
