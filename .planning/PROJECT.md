# Opportunities Hub

## What This Is

Un dashboard web personal para Juan (estudiante de Ingeniería de Software, ciclos avanzados en UPC, correo institucional u202317692@upc.edu.pe) que agrega en vivo internships, programas de industria y beneficios/descuentos estudiantiles desde fuentes públicas de GitHub, permite trackear el estado de sus propias postulaciones, y desde v1.1 puede arrancar un auto-apply asistido por IA (botón "Send to AI" → prompt para una sesión externa de Claude Code, con revisión humana obligatoria antes de cualquier envío). El objetivo es explotar al máximo las ventajas de ser estudiante universitario para ampliar oportunidades laborales y de networking.

## Core Value

Juan abre una sola página y ve, siempre actualizado, qué internships/programas le sirven hoy y qué beneficios .edu no está aprovechando — sin tener que revisar manualmente varios repos de GitHub.

## Requirements

### Validated

- ✓ Ingestión y normalización de las 3 fuentes (Summer2027-Internships, underclassmen-opportunities, student-benefits) en Postgres — Phase 1
- ✓ Sync programado (cron 2h) + trigger manual protegido, sin fetch-por-request — Phase 1
- ✓ `external_id` estable (con `url` incluido en el hash tras detectar colisiones reales) y soft-delete aislado por fuente — Phase 1
- ✓ Ver listado de internships/roles SWE (y afines) actualizado en vivo desde Summer2027-Internships — Phase 2
- ✓ Ver listado de programas/oportunidades para underclassmen (visible, no oculto, sin scoring aún) — Phase 2
- ✓ Ver catálogo de beneficios .edu desde student-benefits — Phase 2
- ✓ Filtrar/buscar oportunidades y beneficios por categoría, tipo, estado (abierto/cerrado) — Phase 2

- ✓ Marcar el estado de una postulación propia (por aplicar / aplicado / en proceso / rechazado / aceptado / guardado) con notas — Phase 3
- ✓ Los datos de aplicaciones persisten y se sincronizan entre dispositivos (no localStorage, verificado cross-device) — Phase 3
- ✓ Datos de oportunidades/beneficios se refrescan desde las fuentes en vivo (no copia estática mantenida a mano) — Phase 1

- ✓ Perfil de datos flexible (key-value), se completa incrementalmente con el uso, con carga inicial de datos básicos — Phase 5
- ✓ Etapas intermedias nuevas en el tracking de postulaciones (auto_fill_in_progress / ready_to_review / submitted), de solo lectura fuera del callback — Phase 5
- ✓ Endpoint API con bearer secret para que una sesión externa de Claude Code actualice estado/notas/perfil de forma atómica — Phase 6
- ✓ Historial de qué datos se enviaron a cada sitio/aplicación específica (no solo el perfil global) — Phase 6
- ✓ Botón "Send to AI" por oportunidad (Internships/Underclassmen) que genera/copia un prompt autocontenido con link + perfil + instrucciones de Playwright MCP + revisión humana antes de enviar — Phase 7

### Active

(Ninguno pendiente — v1.1 shipped 2026-09-10. Próximo milestone por definir)

### Out of Scope

- Autenticación multi-usuario / cuentas de terceros — es una herramienta personal de un solo usuario, no un producto para otros
- Auto-submit sin revisión humana — el submit final en cada ATS lo confirma Juan siempre; ver v1.1 "Auto-apply asistido con IA" para el alcance real (auto-fill + revisión, no auto-submit)
- Alertas push/email/Telegram en v1 — se evalúa como v2 si el dashboard demuestra valor
- Curaduría manual de nuevas fuentes más allá de las 3 dadas — se puede sumar investigación de fuentes adicionales (GitHub Global Campus, otras listas awesome) como research, no como mantenimiento continuo

## Context

- Fuentes de datos identificadas:
  - `SimplifyJobs/Summer2027-Internships` — tabla markdown, ~1200+ roles SWE/PM/DS/Quant/Hardware, actualizada a diario por la comunidad. Fuente principal de internships para el perfil de Juan.
  - `Jose-Gael-Cruz-Lopez/underclassmen-opportunities` — tabla markdown de programas/becas/research exclusivos para freshman-sophomore. Menos relevante por ciclo avanzado, pero útil para detectar programas de "industry entry" sin restricción de año.
  - `Mapaor/student-benefits` — `benefits.json` con estructura `{title, description, imageSrc, tags, campusRequired}`, listado de descuentos/beneficios vía correo .edu.
- Candidatos adicionales a investigar en la fase de research: GitHub Global Campus / Student Developer Pack (fuente oficial de beneficios), otras listas "awesome" de programas para estudiantes, Summer-Internships general (no solo 2027).
- El correo institucional (u202317692@upc.edu.pe) es la llave para reclamar beneficios .edu — a verificar caso por caso si GitHub Education acepta dominios .edu.pe (no todos los programas .edu-only aceptan dominios no-.edu de EE.UU.).
- v1.1 (auto-apply asistido) shipped 2026-09-10: perfil flexible (`profile_fields`), etapas intermedias de tracking, endpoint de callback atómico (`POST /api/applications/[externalId]/apply-session`), y el botón "Send to AI" que arma el prompt de 7 secciones. El llenado interactivo de formularios corre con **Playwright MCP** en la sesión externa de Claude Code, no dentro de esta app ni con Scrapling (corrección de research/SUMMARY.md al brief original).
- Deuda técnica aceptada tras v1.1 (ver Key Decisions): secret maestro fijo en el callback, perfil sin cifrar, revisión humana no forzada técnicamente — los 3 revisados y confirmados con Juan en el audit de cierre de milestone (2026-09-10), ninguno bloqueante para el uso actual.

## Constraints

- **Alcance**: Proyecto personal de un solo usuario (Juan) — no se diseña para escalar a otros estudiantes.
- **Datos en vivo**: Las tres fuentes son repos públicos de GitHub sin API dedicada — el fetch en vivo depende de leer README/JSON vía GitHub API o raw content, respetando rate limits.
- **Persistencia**: El tracking de postulaciones necesita un backend/DB liviano (no solo localStorage) por el requisito de sincronización multi-dispositivo.
- **Deploy**: No se despliega en Vercel — el hosting propio de Juan vive en `/Users/juan/Documents/Codigo/Personal/hosting` (Dokploy sobre VPS Hetzner `sapling-vps-01`, gestionado vía API con `DOKPLOY_TOKEN`; DBs nativas Postgres/MariaDB/Redis provisionadas ahí). El dominio se gestiona con la API de Cloudflare. La app final va en un subdominio de `juan-tech.com`.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Fetch en vivo de las 3 fuentes en vez de snapshot estático | Evita mantenimiento manual; los repos (especialmente Summer2027-Internships) se actualizan a diario | — Pending |
| Tracking de postulaciones incluido desde v1 | Es el caso de uso diario real, no solo descubrimiento | — Pending |
| Persistencia multi-dispositivo (backend/DB) en vez de solo localStorage | Juan necesita ver su estado desde celu y laptop | — Pending |
| Deploy en hosting propio (Dokploy/Hetzner) + Cloudflare, no Vercel | Juan ya tiene infraestructura propia gestionable vía API en `hosting/infra`; pidió explícitamente subirlo ahí con subdominio de juan-tech.com | — Pending |
| DB de dev en Dokploy (`shared-postgres`, tenant `opportunities`) solo accesible desde la red interna del VPS | No es alcanzable desde fuera para dev local — se usó Postgres local en Docker (puerto 5434) para dev/test, y la DB de Dokploy queda reservada para el deploy real en Fase 4 | ✓ Good |
| `external_id` de `opportunities` incluye `url` en el hash (no solo company+title+locations) | El plan original colisionaba en 1867/16109 filas reales de Summer2027-Internships; con `url` quedó 16109/16109 únicos | ✓ Good |
| GITHUB_PAT no bloqueó la ejecución de Fase 1 | Corrimos el sync de prueba sin autenticar (bajo volumen, solo dev); production/cron real necesita el PAT seteado antes de confiar en el sync cada 2h | ⚠️ Revisit antes de Fase 4 |
| Dirección visual: mundo tipo Linear/Kanban dev-tool (near-black + acento violeta), vía skill Impeccable | Pedido explícito de Juan de usar Impeccable para toda la UI; direction contract en `.impeccable/surfaces/`, documentado en `DESIGN.md` tras el build real | ✓ Good |
| Tabla de Internships (16,109 filas) sin virtualización | El tab-switcher tardaba 6-13s en volverse alcanzable por teclado en producción | ✓ Good — resuelto en Phase 3 con TanStack Virtual: 6-13s → ~1.3-1.9s, DOM de 16,109 filas → 27 |
| Notas y estado referencian `applications.opportunity_external_id` (nunca el id serial de cache) | Sobrevive resyncs de Phase 1 sin perder el tracking del usuario (research/ARCHITECTURE.md Anti-Pattern 2) | ✓ Good |
| v1.1: se revierte la exclusión de v1.0 sobre auto-apply, pero acotado a auto-fill + revisión humana (no auto-submit) | Juan lo pidió explícitamente; el submit automático sin revisión seguía siendo demasiado riesgoso (ToS de cada ATS, errores irreversibles por oferta) | ✓ Good — implementado en Phase 7, "esperar OK de Juan" es instrucción explícita del prompt (T-07-05, aceptado como no-gate técnico) |
| Auto-apply corre como sesión de Claude Code externa (no motor de browser-automation dentro de la app) | Evita construir/mantener un engine de automatización frágil contra decenas de ATS distintos; reusa el Claude Code que Juan ya usa a diario | ✓ Good — research/SUMMARY.md corrigió el brief original de Scrapling a Playwright MCP (Scrapling no sirve para llenado interactivo de forms SPA); ninguna de las dos es dependencia de la app, ambas corren solo en la sesión externa |
| `AUTO_APPLY_CALLBACK_SECRET` es un secret maestro fijo embebido en cada prompt copiado (no token de un solo uso por aplicación) | Evaluado durante el discuss de Phase 6; tokens de corta duración agregaban complejidad sin un caso de uso concreto que lo justificara | ⚠️ Revisit si el volumen de uso crece — riesgo aceptado (T-06-07/T-07-02), confirmado con Juan post-audit de v1.1 |
| `profile_fields` sin cifrado a nivel de aplicación en la misma Postgres compartida | Hoy solo guarda datos no sensibles (nombre/email/teléfono/CV/LinkedIn/GitHub); cifrado especulativo sin campo real que lo justifique | ⚠️ Revisit antes de agregar cualquier campo genuinamente sensible (SSN, datos financieros) — riesgo aceptado (T-05-03), confirmado con Juan post-audit de v1.1 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-09-10 after v1.1 milestone (Auto-apply asistido con IA)*
