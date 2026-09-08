# Phase 5: Perfil y Etapas de Tracking - Context

**Gathered:** 2026-09-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Juan tiene un perfil de datos flexible que puede ver y editar manualmente, y el tracking de postulaciones soporta las etapas intermedias de una sesión de auto-apply a medias. Cubre PROFILE-01, PROFILE-02, TRACK-05, TRACK-06. No incluye el endpoint de callback (Phase 6) ni el botón "Send to AI" (Phase 7) — esta fase entrega piezas usables a mano por Juan de manera independiente.

</domain>

<decisions>
## Implementation Decisions

### Perfil UI
- Nueva pestaña "Perfil" junto a Internships/Underclassmen/Benefits, reusando `dashboard-tabs.tsx`
- Edición inline por fila (clave-valor), autosave debounced — mismo patrón que `NotesPopover`
- Juan puede agregar un campo nuevo a mano con botón "+ Agregar campo" (label + valor libres), no solo vía callback (Phase 6)
- Empty state (perfil vacío) muestra CTA "Cargar datos básicos" que abre el formulario de carga inicial

### Modelo de datos del perfil
- Carga inicial (PROFILE-02): nombre completo, email, teléfono, link CV/resume, LinkedIn, GitHub
- Columna `category` libre en `profile_fields` (ej. "contacto", "links", "preguntas comunes") para agrupar visualmente
- `key` normalizada (snake_case, sin espacios) + `label` legible aparte para mostrar en UI
- Si el callback (Phase 6) escribe una key existente con otro valor: se sobreescribe (último valor gana), sin versionado/historial de cambios de perfil

### Etapas intermedias de tracking
- Nombres exactos: `auto_fill_in_progress`, `ready_to_review`, `submitted` (snake_case en inglés, consistente con las 6 etapas existentes)
- Visibles en `StatusDropdown` pero de solo-lectura ahí — Juan no las selecciona a mano, solo el callback de Phase 6 las setea (evita uso accidental fuera del flujo de auto-apply)
- Íconos propios reusando la paleta violeta Impeccable: reloj (`auto_fill_in_progress`), ojo (`ready_to_review`), check outline (`submitted`) — no reusar los colores/íconos de las 6 etapas manuales existentes
- `submitted` es un estado distinto de `applied` — resultado de un auto-apply confirmado; Juan sigue pudiendo marcar `applied` a mano para aplicaciones no asistidas por IA

### Claude's Discretion
- Estructura exacta de la tabla `profile_fields` (columnas más allá de key/value/label/category) queda a discreción del planner, siguiendo el patrón EAV ya validado en research/STACK.md
- Layout exacto de la pestaña Perfil (agrupamiento visual por category, orden) queda a discreción, siguiendo DESIGN.md

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/dashboard/notes-popover.tsx` — patrón de edición inline con autosave debounced + Zod-validated Server Action, a replicar para la edición de campos de perfil
- `src/components/dashboard/dashboard-tabs.tsx` — tabs existentes (Internships/Underclassmen/Benefits), agregar "Perfil" como cuarta tab
- `src/components/dashboard/status-dropdown.tsx` + `src/lib/application-status.ts` — `APPLICATION_STATUSES` es un array de 6 valores, sin Postgres enum; extender este array y el `Record<ApplicationStatus, {...}>` de metadata (íconos/colores) que TypeScript fuerza a cubrir
- `src/components/dashboard/status-pill.tsx` — probablemente comparte metadata de íconos/colores con `status-dropdown.tsx`, revisar ambos al extender

### Established Patterns
- Server Components leen datos vía `src/db/queries/*`; mutaciones vía Zod-validated Server Actions en `src/app/actions/*`
- `applications.status` es `text` libre (no enum de Postgres) — agregar valores es cambio de capa de aplicación/Zod, sin migración
- Tablas nuevas siguen convención de `src/db/schema.ts`: `serial` id interno + timestamps `createdAt`/`updatedAt`, nunca exponer el id serial como FK entre tablas de negocio

### Integration Points
- Nueva tabla `profile_fields` (Drizzle) — no depende de `applications`/`opportunities`
- `status-dropdown.tsx` y `status-pill.tsx` necesitan extender su metadata Record para las 3 etapas nuevas, con el guardrail de TypeScript ya establecido (el build falla si falta un caso)
- `dashboard-tabs.tsx` necesita una cuarta `TabsContent` para "Perfil"

</code_context>

<specifics>
## Specific Ideas

Ninguna adicional — las decisiones de arriba cubren lo específico de esta fase.

</specifics>

<deferred>
## Deferred Ideas

- Versionado/historial de cambios de perfil (qué valor tenía una key antes de sobreescribirse) — no pedido, fuera de alcance de v1.1
- Panel de "qué se envió por aplicación" (APPLY-04) — ya deferido a v1.2 en REQUIREMENTS.md, no es parte de esta fase

</deferred>
