# Phase 6: Callback API de Auto-apply - Context

**Gathered:** 2026-09-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Una sesión externa de Claude Code puede reportar el resultado de un auto-apply (completo o a medias) y el panel de Juan queda actualizado de forma atómica, validada del lado del servidor y auditable. Cubre CALLBACK-01, CALLBACK-02, PROFILE-03, AUDIT-01, AUDIT-02. No incluye el botón "Send to AI" ni la generación del prompt (Phase 7) — esta fase solo construye el endpoint que ese flujo llamará.

</domain>

<decisions>
## Implementation Decisions

### Contrato del endpoint
- `POST /api/applications/[externalId]/apply-session`, mismo patrón REST que el resto de la app (keyed por `opportunityExternalId`)
- Auth: header `Authorization: Bearer <AUTO_APPLY_CALLBACK_SECRET>` — secret propio, no reusar `SYNC_TRIGGER_SECRET`
- Body: `{ status: "auto_fill_in_progress"|"ready_to_review"|"submitted", notes?: string, profileUpdates?: {label,value,category}[], sentFields: {key,label,value}[] }` — un solo endpoint cubre las 3 etapas (completo o a medias)
- Respuesta: JSON `{ok:true}` en éxito; `{ok:false, error:"..."}` con status HTTP apropiado (400 validación, 401 auth, 404 oportunidad inexistente, 500 fallo de transacción) — mismo shape que `updateApplicationStatus`

### Transacción atómica y semántica de escritura
- Una sola `db.transaction()` escribe: `applications.status`(+notes) + upsert de cada `profileUpdates[]` + insert en `application_history` — todo o nada
- `profileUpdates` reusa la misma lógica de detección de colisión de `key` que Phase 5 (CR-01) — si un label nuevo colisiona con un `key` normalizado existente de otro label, la escritura falla con error claro, nunca sobreescribe en silencio
- `sentFields` se guarda tal cual en `application_history`, independiente de si coincide con el estado actual del perfil global (el perfil puede cambiar después)
- Si el `externalId` de la URL no corresponde a ninguna oportunidad existente: 404, no crea nada a ciegas

### Validación server-side
- El endpoint solo acepta los 3 estados nuevos (`auto_fill_in_progress`/`ready_to_review`/`submitted`) — nunca los 6 manuales, esos son dominio exclusivo del Server Action `updateApplicationStatus`
- Máquina de estados simple que solo avanza: `auto_fill_in_progress → ready_to_review → submitted`, transiciones hacia atrás se rechazan
- Cap de tamaño en `sentFields`/`profileUpdates` (ej. máx 50 entradas cada uno)
- `profileUpdates` es opcional — no toda sesión aprende campos nuevos

### Auditoría (`application_history`)
- Una fila nueva por cada llamada al endpoint (historial completo de la sesión, no solo el último estado)
- Referenciada por `opportunity_external_id`, nunca por id serial (mismo anti-patrón que `applications`)
- Incluye `newlyLearnedKeys: string[]` calculado server-side comparando `profileUpdates` contra el estado del perfil antes del write
- No se expone en ninguna UI todavía — solo almacenamiento en esta fase; el panel de inspección es APPLY-04/v1.2

### Claude's Discretion
- Nombre exacto de la tabla Drizzle (`applicationHistory` vs `applicationSendLog`, research/STACK.md sugirió el segundo) y su estructura de columnas más allá de lo especificado arriba
- Estructura interna del validador de transición de estados (función standalone vs inline)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/app/api/sync/route.ts` — patrón exacto de bearer-secret-gated route a replicar (Node runtime, comparación de header, 401/500 responses)
- `src/app/actions/applications.ts` — patrón de validación Zod + `MANUALLY_SELECTABLE_STATUSES` vs `APPLICATION_STATUSES`; este endpoint necesita el complemento inverso (solo los 3 estados nuevos)
- `src/db/queries/profile.ts` — `upsertProfileField` con detección de colisión de key (fix CR-01 de Phase 5), reusar la misma función/lógica
- `src/lib/application-status.ts` — `APPLICATION_STATUSES` (9 valores) y `MANUALLY_SELECTABLE_STATUSES` (6) ya existen; agregar el complemento o derivarlo

### Established Patterns
- Node runtime explícito (`export const runtime = "nodejs"`) en cualquier ruta que toque `pg`/Drizzle
- Zod-validated antes de tocar Postgres, siempre
- Tablas nuevas: `serial` id interno + timestamps, referencian otras tablas de negocio por `external_id`, nunca por id serial

### Integration Points
- Nueva tabla `application_history` (o `applicationSendLog`) en `src/db/schema.ts`
- Nueva ruta `src/app/api/applications/[externalId]/apply-session/route.ts`
- Nueva query module `src/db/queries/application-history.ts` (o extender `src/db/queries/applications.ts`)
- Nueva env var `AUTO_APPLY_CALLBACK_SECRET`

</code_context>

<specifics>
## Specific Ideas

Ninguna adicional — las decisiones de arriba cubren lo específico de esta fase.

</specifics>

<deferred>
## Deferred Ideas

- Panel UI para inspeccionar `application_history` (APPLY-04) — ya deferido a v1.2 en REQUIREMENTS.md
- Tokens de corta duración por aplicación en vez de un secret maestro fijo (sugerido por research/PITFALLS.md como mitigación de leak-risk) — evaluado y descartado para v1.1 por complejidad extra sin research adicional; el secret maestro es aceptable para v1.1 dado que ya es el patrón usado en `/api/sync`

</deferred>
