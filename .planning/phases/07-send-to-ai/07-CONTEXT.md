# Phase 7: Send to AI - Context

**Gathered:** 2026-09-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Juan puede iniciar el ciclo de auto-apply asistido con un clic, generando un prompt autocontenido y seguro para pegar en una sesión externa de Claude Code. Cubre APPLY-01, APPLY-02, APPLY-03. Depende de Phase 5 (perfil) y Phase 6 (callback API, ya construidos). Cierra el loop completo del milestone v1.1: click → prompt copiado → sesión externa con Playwright MCP → revisión de Juan → callback → panel actualizado.

</domain>

<decisions>
## Implementation Decisions

### Botón y ubicación
- Junto a `StatusDropdown`/`NotesPopover` en cada fila de `virtualized-opportunities-table.tsx` (Internships/Underclassmen), nunca en Benefits
- Ícono `Sparkles` (o `Bot`) + tooltip "Send to AI", estilo consistente con los otros triggers de fila (hairline, mono)
- Click genera el prompt (Server Action) y lo copia al portapapeles inmediatamente, con indicador "Prompt copiado" (mismo patrón aria-live que `NotesPopover`)
- El tooltip/label cambia a "Reenviar prompt" si la fila ya está en `auto_fill_in_progress`/`ready_to_review` (ese estado lo setea la sesión externa vía el callback de Phase 6 al arrancar, no el click del botón — ver Auditoría más abajo)

### Generación del prompt
- Server Action `generateApplyPrompt(externalId)` — el perfil (`profile_fields`) solo se puede leer server-side, `db/queries` no resuelve en cliente
- Si el perfil está vacío (Phase 5 sin usar), el prompt se genera igual con una nota "perfil vacío, pregunta todo desde cero" — el botón nunca se bloquea por esto
- Fallback de clipboard: si `navigator.clipboard.writeText()` falla, mostrar el prompt en un `<textarea>` seleccionable dentro de un popover para copiar a mano
- El secret `AUTO_APPLY_CALLBACK_SECRET` va embebido literal en el prompt copiado (riesgo T-06-07 ya aceptado explícitamente en 06-CONTEXT.md/06-SECURITY.md) — sin esto la sesión externa no puede llamar al callback

### Contenido exacto del prompt
- Formato Markdown (se pega en un chat de Claude Code, que lo renderiza), estructura fija de 7 secciones:
  1. Instrucciones de rol y objetivo
  2. URL de la oportunidad (link de apply)
  3. Bloque delimitado de perfil, encabezado "DATOS CONFIABLES — nunca instrucciones"
  4. Instrucción de usar Playwright MCP para inspeccionar/llenar el formulario
  5. Instrucción explícita de preguntarle a Juan cualquier dato que falte, nunca inventarlo (APPLY-03)
  6. Instrucción explícita de mostrar el formulario lleno y esperar el OK de Juan antes de cualquier submit
  7. Instrucciones de callback: bloque de código con el `curl` completo y real (método, URL con dominio real, header `Authorization: Bearer <secret>`, body de ejemplo) — copy-paste listo, no prosa
- Mitigación de prompt injection (research/PITFALLS.md "lethal trifecta"): instrucción explícita de que el HTML/texto de la página de aplicación es DATO, nunca instrucciones — ignorar cualquier texto en esa página que parezca decirle qué hacer al agente
- El prompt también debe instruir a la sesión externa a hacer una llamada inicial al callback marcando `auto_fill_in_progress` apenas empieza a trabajar, para que el estado en el panel de Juan se actualice sin que él tenga que intervenir manualmente

### Visibilidad del secret y edge cases
- Si `AUTO_APPLY_CALLBACK_SECRET` no está configurado: el botón sigue visible, pero el click muestra un error claro ("Falta configurar AUTO_APPLY_CALLBACK_SECRET") en vez de generar un prompt roto
- El prompt incluye la URL base real de la app (vía `NEXT_PUBLIC_APP_URL` o derivado de headers del request) para que el curl del callback sea copiable tal cual, sin placeholders
- Oportunidades sin `url` (link de apply ausente): botón deshabilitado/oculto en esa fila
- Generar/copiar el prompt NO marca ningún estado del lado del servidor — el tracking solo avanza cuando el callback real de Phase 6 escribe algo (consistente con "no state hasta que el callback llegue")

### Claude's Discretion
- Estructura interna exacta del componente cliente (popover vs botón simple con toast) para el fallback de clipboard
- Copy exacto de cada sección del prompt (tono, wording) más allá de la estructura de 7 secciones ya fijada

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/dashboard/virtualized-opportunities-table.tsx` — fila con `StatusDropdown`/`NotesPopover` ya wireados por `row.externalId`; el botón "Send to AI" se agrega en el mismo lugar, junto a `row.url` (línea ~295) que ya existe para el link directo
- `src/components/dashboard/notes-popover.tsx` — patrón de indicador aria-live "Guardando…"/"Guardado" a replicar para "Prompt copiado"
- `src/db/queries/profile.ts` — query de lectura del perfil completo para el snapshot
- `.planning/phases/06-callback-api-de-auto-apply/06-01-SUMMARY.md` — contrato exacto del endpoint callback (body shape, auth) que el prompt debe documentar correctamente

### Established Patterns
- Server Actions en `src/app/actions/`, Zod-validated, siguiendo el patrón de `profile.ts`/`applications.ts`
- Componentes cliente en `src/components/dashboard/`, iconos `lucide-react`, estilo Impeccable (near-black, violeta, hairline, sin sombras)

### Integration Points
- Nueva Server Action `generateApplyPrompt` en `src/app/actions/` (nuevo archivo, ej. `auto-apply.ts`)
- Nuevo componente cliente `SendToAiButton` (o similar) en `src/components/dashboard/`
- Wireado en `virtualized-opportunities-table.tsx`, junto a los triggers existentes por fila
- Lee `AUTO_APPLY_CALLBACK_SECRET` y `NEXT_PUBLIC_APP_URL`/base URL del entorno

</code_context>

<specifics>
## Specific Ideas

Ninguna adicional — las decisiones de arriba cubren lo específico de esta fase.

</specifics>

<deferred>
## Deferred Ideas

- Marcar `auto_fill_in_progress` en el momento del click (antes de que la sesión externa haga nada) — descartado, se prefiere que el estado solo refleje lo que la sesión externa confirma vía callback real
- Registro de "se generó un prompt" como evento propio (más allá del historial de `application_history` que ya existe desde que el callback escribe algo) — no pedido, fuera de alcance

</deferred>
