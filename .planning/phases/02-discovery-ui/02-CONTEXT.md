# Phase 2: Discovery UI - Context

**Gathered:** 2026-09-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Juan puede ver y filtrar, en una sola página, todas las oportunidades y beneficios reflejando el último sync de Phase 1 (Postgres). Cubre DISC-01 a DISC-04 y BENE-01. No incluye tracking de postulaciones (Phase 3) ni deploy (Phase 4).

</domain>

<decisions>
## Implementation Decisions

### Layout e Información
- Tabs por tipo: Internships / Programas Underclassmen / Beneficios .edu
- Dentro de cada tab, tabla filtrable con buscador global arriba (aplica a la tab activa)
- Filtros como chips (categoría, tipo de rol, abierto/cerrado), no dropdowns anidados
- Underclassmen se muestra pero deprioritizado visualmente (no oculto) dado que Juan ya no es underclassman — sin lógica de scoring aún (eso es DISC-05, v2)

### Estados de carga/error/frescura
- Badge "Actualizado hace Xh" visible por fuente/tab (dato de `sync_log`, ya existe en Phase 1)
- Banner de advertencia si la fuente lleva >6h sin sync exitoso, o si el último `sync_log` de esa fuente marca `success=false`
- Skeleton loaders al cargar datos, nunca spinners genéricos
- Indicador visual (badge + texto, no solo color) para filas cerradas/inactivas — cumple A11Y (no depender solo de color)

### Accesibilidad y densidad visual
- **Regla fija, no negociable**: seguir estrictamente `A11Y.md` (https://github.com/fecarrico/A11Y.md) — WCAG, navegación completa por teclado, foco visible, roles ARIA correctos en la tabla (`role="table"`/`row`/`cell` o `<table>` semántico nativo), contraste AA mínimo, nunca informar estado solo por color
- Tabla compacta tipo spreadsheet (para escanear 1200+ filas rápido) pero con foco visible y tamaño de fuente mínimo AA
- Componentes: shadcn/ui + Tailwind v4 (per research/STACK.md)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/db/schema.ts` — tablas `opportunities`, `benefits` ya existen con `is_active`, `external_id`
- `src/db/client.ts` — cliente Drizzle ya configurado
- `sync_log` table (Phase 1) — tiene timestamp, source, success, rows_upserted; usar para el badge de frescura y el banner de advertencia
- `src/app/page.tsx` — actualmente placeholder de `create-next-app`, se reemplaza en esta fase

### Established Patterns
- Next.js 16 App Router, Server Components por defecto (research/STACK.md) — preferir fetch de datos en el servidor sobre client-side fetching
- Drizzle queries ya siguen el patrón `db/queries/*.ts` (ver `upsert.ts`, `sync-log.ts` de Phase 1) — seguir el mismo patrón para queries de lectura/filtrado

### Integration Points
- Nueva carpeta `src/db/queries/opportunities.ts` / `benefits.ts` para queries de lectura filtrada (no existían aún, Phase 1 solo tenía upsert)
- `src/app/page.tsx` se convierte en el dashboard real

</code_context>

<specifics>
## Specific Ideas

Ninguna referencia visual externa específica — usar shadcn/ui defaults con la densidad y accesibilidad descritas arriba.

</specifics>

<deferred>
## Deferred Ideas

- Relevance scoring/deprioritización automática de underclassmen (DISC-05, v2)
- Badge "nuevo desde tu última visita" (DISC-06, v2, requiere snapshot history)
- Flag de elegibilidad .edu.pe en beneficios (BENE-02, v2)

</deferred>
