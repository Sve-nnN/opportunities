# Roadmap: Opportunities Hub

## Milestone: v1.1 — Auto-apply asistido con IA

**v1.0 MVP ya está en producción** (Fases 1-4, shipped 2026-09-08). Su historial completo vive archivado en `.planning/milestones/v1.0-ROADMAP.md` y `.planning/milestones/v1.0-phases/`. Este archivo contiene únicamente las fases de v1.1, continuando la numeración desde la Fase 4.

## Overview

Juan necesita poder mandar cualquier oportunidad (Internships/Underclassmen) a una sesión externa de Claude Code que llene el formulario de aplicación por él, con revisión humana obligatoria antes de cualquier envío. El camino va de adentro hacia afuera: primero se construye la base de datos que todo lo demás necesita — el perfil flexible de Juan (editable a mano) y las nuevas etapas de tracking que reflejan una sesión de auto-apply a medias — porque tanto el endpoint de callback como el botón "Send to AI" dependen de que ese perfil y esos estados ya existan y sean observables. Sobre esa base se construye el endpoint de callback gateado por secreto, que escribe de forma atómica estado, perfil y bitácora de auditoría cuando una sesión externa termina (o queda a medias). Por último se construye el botón "Send to AI" y la generación del prompt que arranca todo el ciclo, cerrando el loop completo: click → prompt copiado → sesión externa de Claude Code con Playwright MCP → revisión de Juan → callback → panel actualizado.

## Phases

**Phase Numbering:**

- Integer phases (5, 6, 7): Planned v1.1 work, continuando desde la Fase 4 de v1.0
- Decimal phases (5.1, 5.2): Inserciones urgentes (marcadas con INSERTED)

- [ ] **Phase 5: Perfil y Etapas de Tracking** - Perfil de datos flexible (ver/editar) + nuevas etapas intermedias en el dropdown de estado
- [ ] **Phase 6: Callback API de Auto-apply** - Endpoint bearer-secret que escribe estado, perfil y auditoría en una transacción atómica
- [ ] **Phase 7: Send to AI** - Botón que genera y copia el prompt autocontenido para la sesión externa de IA

## Phase Details

### Phase 5: Perfil y Etapas de Tracking

**Goal**: Juan tiene un perfil de datos flexible que puede ver y editar manualmente, y el tracking de postulaciones soporta las etapas intermedias de una sesión de auto-apply a medias.
**Depends on**: Phase 4 (v1.0 shipped)
**Requirements**: PROFILE-01, PROFILE-02, TRACK-05, TRACK-06
**Success Criteria** (what must be TRUE):

  1. Juan puede ver y editar su perfil de datos como pares clave-valor flexibles, sin necesidad de un schema rígido
  2. El perfil arranca con una carga inicial de datos básicos (nombre, email, CV, links)
  3. El dropdown de estado de una postulación muestra y permite seleccionar las nuevas etapas intermedias (`auto_fill_in_progress` / `ready_to_review` / `submitted`)
  4. `applications.status` acepta esas etapas intermedias además de las 6 ya existentes

**Plans**: TBD

**UI hint**: yes

### Phase 6: Callback API de Auto-apply

**Goal**: Una sesión externa de Claude Code puede reportar el resultado de un auto-apply (completo o a medias) y el panel de Juan queda actualizado de forma atómica, validada del lado del servidor y auditable.
**Depends on**: Phase 5
**Requirements**: CALLBACK-01, CALLBACK-02, PROFILE-03, AUDIT-01, AUDIT-02
**Success Criteria** (what must be TRUE):

  1. Un endpoint API gateado por bearer secret actualiza estado, notas y perfil en una sola transacción atómica (todo o nada)
  2. El endpoint valida transiciones de estado y payload del lado del servidor, sin confiar ciegamente en el caller (quien llama es la interpretación de un LLM de una página web arbitraria)
  3. Los campos nuevos que una sesión de auto-apply aprende (porque un sitio los pidió) se guardan automáticamente en el perfil para la próxima vez
  4. Cada escritura del callback deja un registro de exactamente qué datos se enviaron a esa aplicación específica, no solo el perfil global
  5. Ese historial se referencia siempre por `opportunity_external_id`, nunca por el id serial de cache

**Plans**: TBD

### Phase 7: Send to AI

**Goal**: Juan puede iniciar el ciclo de auto-apply asistido con un clic, generando un prompt autocontenido y seguro para pegar en una sesión externa de Claude Code.
**Depends on**: Phase 5, Phase 6
**Requirements**: APPLY-01, APPLY-02, APPLY-03
**Success Criteria** (what must be TRUE):

  1. Cada oportunidad de Internships/Underclassmen muestra un botón "Send to AI"
  2. Al hacer clic, se genera y copia un prompt con el link de la oportunidad, un snapshot del perfil, instrucción de usar Playwright MCP para el llenado, e instrucción explícita de pedir el OK de Juan antes de enviar
  3. El prompt instruye explícitamente a la sesión de IA a preguntarle a Juan cualquier dato que falte, nunca inventarlo

**Plans**: TBD

**UI hint**: yes

## Progress

**Execution Order:**
Fases de v1.1 en orden numérico: 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 5. Perfil y Etapas de Tracking | 0/TBD | Not started | - |
| 6. Callback API de Auto-apply | 0/TBD | Not started | - |
| 7. Send to AI | 0/TBD | Not started | - |
</content>
