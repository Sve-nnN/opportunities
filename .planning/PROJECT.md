# Opportunities Hub

## What This Is

Un dashboard web personal para Juan (estudiante de Ingeniería de Software, ciclos avanzados en UPC, correo institucional u202317692@upc.edu.pe) que agrega en vivo internships, programas de industria y beneficios/descuentos estudiantiles desde fuentes públicas de GitHub, y permite trackear el estado de sus propias postulaciones. El objetivo es explotar al máximo las ventajas de ser estudiante universitario para ampliar oportunidades laborales y de networking.

## Core Value

Juan abre una sola página y ve, siempre actualizado, qué internships/programas le sirven hoy y qué beneficios .edu no está aprovechando — sin tener que revisar manualmente varios repos de GitHub.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Ver listado de internships/roles SWE (y afines) actualizado en vivo desde Summer2027-Internships
- [ ] Ver listado de programas/oportunidades para underclassmen relevantes (filtrado, ya que su ciclo es avanzado)
- [ ] Ver catálogo de beneficios .edu (GitHub Student Pack y otros) desde student-benefits
- [ ] Filtrar/buscar oportunidades y beneficios por categoría, tipo, estado (abierto/cerrado)
- [ ] Marcar el estado de una postulación propia (por aplicar / aplicado / en proceso / rechazado / aceptado) con notas
- [ ] Los datos de aplicaciones persisten y se sincronizan entre dispositivos (no solo localStorage)
- [ ] Datos de oportunidades/beneficios se refrescan desde las fuentes en vivo (no copia estática mantenida a mano)

### Out of Scope

- Autenticación multi-usuario / cuentas de terceros — es una herramienta personal de un solo usuario, no un producto para otros
- Aplicar automáticamente a internships (auto-apply) — fuera de alcance, riesgo alto y no pedido
- Alertas push/email/Telegram en v1 — se evalúa como v2 si el dashboard demuestra valor
- Curaduría manual de nuevas fuentes más allá de las 3 dadas — se puede sumar investigación de fuentes adicionales (GitHub Global Campus, otras listas awesome) como research, no como mantenimiento continuo

## Context

- Fuentes de datos identificadas:
  - `SimplifyJobs/Summer2027-Internships` — tabla markdown, ~1200+ roles SWE/PM/DS/Quant/Hardware, actualizada a diario por la comunidad. Fuente principal de internships para el perfil de Juan.
  - `Jose-Gael-Cruz-Lopez/underclassmen-opportunities` — tabla markdown de programas/becas/research exclusivos para freshman-sophomore. Menos relevante por ciclo avanzado, pero útil para detectar programas de "industry entry" sin restricción de año.
  - `Mapaor/student-benefits` — `benefits.json` con estructura `{title, description, imageSrc, tags, campusRequired}`, listado de descuentos/beneficios vía correo .edu.
- Candidatos adicionales a investigar en la fase de research: GitHub Global Campus / Student Developer Pack (fuente oficial de beneficios), otras listas "awesome" de programas para estudiantes, Summer-Internships general (no solo 2027).
- El correo institucional (u202317692@upc.edu.pe) es la llave para reclamar beneficios .edu — a verificar caso por caso si GitHub Education acepta dominios .edu.pe (no todos los programas .edu-only aceptan dominios no-.edu de EE.UU.).

## Constraints

- **Alcance**: Proyecto personal de un solo usuario (Juan) — no se diseña para escalar a otros estudiantes.
- **Datos en vivo**: Las tres fuentes son repos públicos de GitHub sin API dedicada — el fetch en vivo depende de leer README/JSON vía GitHub API o raw content, respetando rate limits.
- **Persistencia**: El tracking de postulaciones necesita un backend/DB liviano (no solo localStorage) por el requisito de sincronización multi-dispositivo.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Fetch en vivo de las 3 fuentes en vez de snapshot estático | Evita mantenimiento manual; los repos (especialmente Summer2027-Internships) se actualizan a diario | — Pending |
| Tracking de postulaciones incluido desde v1 | Es el caso de uso diario real, no solo descubrimiento | — Pending |
| Persistencia multi-dispositivo (backend/DB) en vez de solo localStorage | Juan necesita ver su estado desde celu y laptop | — Pending |

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
*Last updated: 2026-09-07 after initialization*
