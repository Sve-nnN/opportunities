# Phase 3: Application Tracking - Context

**Gathered:** 2026-09-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Juan puede trackear el estado real de sus postulaciones (por aplicar / aplicado / en proceso / rechazado / aceptado / guardado-me interesa) con notas libres, persistido en Postgres y visible igual desde cualquier dispositivo. Cubre TRACK-01 a TRACK-04. Se construye sobre la tabla de Discovery UI (Phase 2), agregando controles interactivos por fila — no reemplaza esa UI.

</domain>

<decisions>
## Implementation Decisions

### Interacción del status
- Dropdown/select inline en cada fila de la tabla (no modal, no panel lateral) con las opciones: guardado/me interesa, por aplicar, aplicado, en proceso, rechazado, aceptado
- Cambiar el estado actualiza inmediatamente vía Server Action + `revalidatePath` (patrón ya establecido en Phase 1/2, sin React Query — server-first)
- "Guardado/me interesa" es un estado más de la misma columna, no una UI separada (satisface TRACK-04)

### Notas
- Ícono de nota en la fila (relleno si tiene texto, outline si vacía) que abre un popover con textarea
- Autosave con debounce (~500ms), sin botón "Guardar" explícito — igual patrón de autosave que search bar de Phase 2 (debounce 300ms)

### Persistencia y modelo de datos
- Tabla `applications` ya existe en el schema desde Phase 1 (schema-only, sin CRUD) — esta fase construye las queries y Server Actions sobre ella
- Referenciar por `external_id` de la oportunidad, nunca por ID autoincremental de la tabla de cache (per research/ARCHITECTURE.md Anti-Pattern 2) — sobrevive resyncs
- Single-user: no `user_id` necesario, una sola fila de tracking por `external_id`

### Virtualización de tabla (decisión técnica, no discutida como grey area — ya estaba flaggeada como blocker en STATE.md)
- Esta fase agrega un control interactivo (dropdown) a cada una de las 16,109 filas de Internships — el problema de performance/teclado ya documentado en Phase 2 (6-13s para que el tab-switcher sea alcanzable por teclado) empeora si no se resuelve ahora
- **Decisión: implementar virtualización de filas (TanStack Virtual) como parte de esta fase**, antes o junto con agregar el dropdown de status — no diferir más, ya que cada fila virtualizada ahora también necesita renderizar un control interactivo
- Mantener accesibilidad por teclado funcional dentro de la lista virtualizada (roving tabindex o equivalente)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/db/schema.ts` — tabla `applications` (external_id, status, notes, timestamps) ya definida en Phase 1
- `src/app/page.tsx` — dashboard con 3 tabs, tabla de Internships/Underclassmen/Benefits ya construida (Phase 2)
- `.impeccable/surfaces/src-app-page-tsx.md` y `DESIGN.md` — dirección visual ya locked y documentada; esta fase la extiende, no la re-decide
- Patrón de Server Actions + `revalidatePath` establecido en Phase 1 (`/api/sync` usa route handler; para esta fase usar Server Actions directamente, más idiomático para mutaciones de UI)

### Established Patterns
- Todo Server Component por defecto, sin fetch en cliente (Phase 1/2)
- Status pills icon+texto (nunca solo color) — el dropdown de status debe seguir el mismo principio de A11Y
- Verificación contra Postgres real vía scripts `tsx` ad hoc (no hay framework de testing instalado — mismo patrón que Phase 1/2)

### Integration Points
- Nueva carpeta `src/app/actions/applications.ts` (Server Actions) o extender `src/db/queries/` con `applications.ts`
- La tabla de Internships en `page.tsx` necesita refactor a virtualización (TanStack Virtual) — afecta el componente de tabla existente, no solo agregar una columna

</code_context>

<specifics>
## Specific Ideas

Ninguna referencia visual externa adicional — extiende el `DESIGN.md` ya construido en Phase 2 (near-black, acento violeta, pills icon+texto, tabular-nums).

</specifics>

<deferred>
## Deferred Ideas

- Badge "nuevo desde tu última visita" (DISC-06, v2)
- Notificaciones push/email (NOTIF-01, v2)

</deferred>
