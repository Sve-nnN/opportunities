# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.1 — Auto-apply asistido con IA

**Shipped:** 2026-09-10
**Phases:** 3 | **Plans:** 5 | **Sessions:** 1

### What Was Built
- Perfil de datos flexible (`profile_fields`, EAV) con pestaña "Perfil" editable a mano — carga inicial, edición inline autosave, agregar campo, empty state
- 3 etapas intermedias de tracking (`auto_fill_in_progress`/`ready_to_review`/`submitted`), de solo lectura fuera del callback
- Endpoint atómico `POST /api/applications/[externalId]/apply-session`, gateado por bearer secret, con `pg_advisory_xact_lock` cerrando una race condition real de escritura concurrente
- Historial por aplicación (`application_history`) de exactamente qué se envió a cada sitio
- Botón "Send to AI" que genera y copia un prompt autocontenido de 7 secciones (perfil, Playwright MCP, mitigación de prompt injection, curl real del callback)

### What Worked
- El research inicial (4 agentes en paralelo: stack/features/architecture/pitfalls) atrapó un error real del brief original antes de escribir código: Scrapling no sirve para llenado interactivo de formularios SPA — Playwright MCP era la herramienta correcta. Corregir esto en research, no en código, evitó una reescritura completa de Phase 7.
- El ciclo review→fix→re-verify encontró bugs reales y no cosméticos en las 3 fases: una colisión silenciosa de `key` con pérdida de datos (Phase 5), una race condition genuina sin lock (Phase 6, confirmada con requests concurrentes reales antes y después del fix), y un secret con destino spoofeable vía header (Phase 7). Ninguno de los tres se habría atrapado solo con tests happy-path.
- Verificación contra infraestructura real (Postgres local, servidor dev, Playwright) en cada fase en vez de confiar en SUMMARY.md — atrapó gaps que el texto por sí solo no hubiera mostrado (ej. Nyquist encontrando que el fix de concurrencia de Phase 6 no tenía test de regresión, a pesar de que la verificación manual sí lo había probado).

### What Was Inefficient
- Un executor de Phase 7 destruyó sin querer el contenedor Postgres de dev real (con 16k+ filas sincronizadas y 4 filas de perfil cargadas a mano) al toparse con el puerto 5434 ocupado y recrearlo con otro nombre — perdiendo datos de perfil que nunca estuvieron en git. Se resincronizaron las oportunidades desde GitHub, pero el perfil hay que volver a cargarlo a mano. Vale la pena que los executors chequeen `docker ps` antes de asumir que un puerto libre significa "nadie lo está usando".
- El conteo de requirements v1.1 tuvo un desliz (dije "15" en el resumen de confirmación cuando la lista real siempre fue 12) — el roadmapper lo detectó y corrigió, pero valdría la pena contar explícitamente antes de presentar un resumen a confirmar.

### Patterns Established
- Threat model por fase (T-XX-NN) documentado en el PLAN.md y verificado en SECURITY.md tras cada code review — cualquier hallazgo nuevo de la revisión que no estaba en el registro original se agrega explícitamente como "Unregistered Flag" en vez de mezclarse silenciosamente.
- Cross-referenciar el fix anterior más reciente (ej. CR-01 de Phase 5 sobre colisión de `key`) al planear un endpoint nuevo que reusa la misma lógica (Phase 6) — evita reintroducir el mismo bug por un segundo punto de entrada.

### Key Lessons
1. Un researcher que corrige el brief del usuario con evidencia concreta (versión de librería, capacidades reales verificadas) ahorra más tiempo que uno que solo confirma lo que el usuario ya pidió.
2. La verificación en vivo (DB real, servidor real, requests concurrentes reales) encuentra clases de bugs que la revisión de código y los tests happy-path no — vale la inversión de tiempo en fases con superficie de escritura nueva (endpoints, transacciones).
3. Un executor que necesita levantar infraestructura local (DB, servidor) debe verificar qué ya existe antes de crear/recrear algo con el mismo puerto — la conveniencia de "just spin up a fresh one" tiene costo real cuando hay datos de sesiones anteriores.

### Cost Observations
- Model mix: no medido por sesión en este proyecto
- Sessions: 1 (milestone completo en una sola sesión continua)
- Notable: 3 fases con research+discuss+plan+plan-check+execute+review+fix+verify+nyquist+security+ui-review cada una, corridas mayormente en paralelo vía subagentes en background — el cuello de botella fue la ejecución (worktrees, builds), no la planificación.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | ~1 | 4 | Primer milestone — ingestión, discovery UI, tracking, deploy |
| v1.1 | 1 | 3 | Primera fase con research corrigiendo el brief del usuario antes de planear; primer endpoint público nuevo con threat model formal por fase |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v1.0 | scripts/verify-*.ts por fase | n/a (sin métrica de cobertura formal) | 0 (stack cerrado desde research inicial) |
| v1.1 | scripts/verify-*.ts por fase + verificación en vivo (Postgres/Playwright/HTTP real) en cada gate | n/a | 1 (shadcn Tooltip, único paquete nuevo — Playwright MCP corre fuera de la app) |

### Top Lessons (Verified Across Milestones)

1. Research que corrige el brief con evidencia verificable (no solo confirma lo pedido) evita reescrituras costosas — validado en v1.1 (Scrapling → Playwright MCP).
