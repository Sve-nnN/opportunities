# Requirements: Opportunities Hub

**Defined:** 2026-09-07
**Core Value:** Juan abre una sola página y ve, siempre actualizado, qué internships/programas le sirven hoy y qué beneficios .edu no está aprovechando — sin tener que revisar manualmente varios repos de GitHub.

## v1 Requirements

### Ingestion (ING)

- [x] **ING-01**: El sistema obtiene y normaliza datos de `SimplifyJobs/Summer2027-Internships` (preferir `listings.json` sobre parsear el README) en un esquema común de oportunidad
- [x] **ING-02**: El sistema obtiene y normaliza datos de `underclassmen-opportunities` (parser markdown GFM real, no regex) en el mismo esquema común
- [x] **ING-03**: El sistema obtiene y normaliza datos de `student-benefits/benefits.json` en un esquema común de beneficio
- [x] **ING-04**: Cada fuente se sincroniza en un job programado (no en cada request) y queda cacheada en Postgres, con reintento manual disponible
- [x] **ING-05**: Los registros usan un `external_id` estable (no autoincremental) para que el tracking de postulaciones nunca pierda su referencia entre syncs
- [x] **ING-06**: Los registros que desaparecen de la fuente se marcan inactivos (soft-delete), nunca se borran físicamente

### Discovery (DISC)

- [x] **DISC-01**: Juan puede ver un listado unificado de internships, programas underclassmen y beneficios, siempre reflejando el último sync (no una copia estática)
- [x] **DISC-02**: Juan puede filtrar/buscar oportunidades por categoría, tipo de rol y estado (abierto/cerrado)
- [x] **DISC-03**: Cada listing muestra si está cerrado/inactivo, con enlace directo a la fuente/aplicación
- [x] **DISC-04**: El dashboard muestra cuándo fue la última sincronización por fuente ("last synced")

### Benefits (BENE)

- [x] **BENE-01**: Juan puede ver el catálogo completo de beneficios .edu (título, descripción, tags) desde `student-benefits`

### Tracking (TRACK)

- [x] **TRACK-01**: Juan puede marcar el estado de una postulación propia (por aplicar / aplicado / en proceso / rechazado / aceptado)
- [x] **TRACK-02**: Juan puede agregar notas libres a una postulación trackeada
- [x] **TRACK-03**: El estado y las notas de las postulaciones persisten en una base de datos y se ven igual desde cualquier dispositivo (no localStorage) — estado ✅ Plan 1, notas ✅ Plan 2
- [x] **TRACK-04**: Juan puede marcar una oportunidad como "guardada/me interesa" sin que eso cuente como "aplicado"

### Deploy (DEPLOY)

- [x] **DEPLOY-01**: La app corre como contenedor Docker desplegado vía la API de Dokploy en el hosting propio de Juan (`hosting/infra`), no en Vercel
- [x] **DEPLOY-02**: La app queda accesible en un subdominio de `juan-tech.com`, con DNS gestionado vía la API de Cloudflare y HTTPS funcionando (Cloudflare Full-strict + Let's Encrypt)
- [x] **DEPLOY-03**: Secretos (PAT de GitHub, credenciales de DB) están configurados como variables de entorno en Dokploy, con el PAT de solo lectura y con expiración

### Profile (PROFILE) — v1.1

- [ ] **PROFILE-01**: Juan puede ver y editar su perfil de datos (pares clave-valor flexibles, sin schema rígido)
- [ ] **PROFILE-02**: El perfil arranca con una carga inicial de datos básicos (nombre, email, CV, links)
- [ ] **PROFILE-03**: Los campos nuevos que una sesión de auto-apply aprende (porque un sitio los pidió) se guardan automáticamente en el perfil para la próxima vez

### Auto-apply asistido (APPLY) — v1.1

- [ ] **APPLY-01**: Cada oportunidad de Internships/Underclassmen tiene un botón "Send to AI"
- [ ] **APPLY-02**: El botón genera y copia un prompt autocontenido (link de la oportunidad + snapshot del perfil + instrucción de usar Playwright MCP para el llenado + instrucción explícita de revisión humana antes de enviar)
- [ ] **APPLY-03**: El prompt instruye explícitamente a la sesión de IA a preguntarle a Juan cualquier dato que falte, nunca inventarlo

### Tracking extendido (TRACK) — v1.1

- [ ] **TRACK-05**: `applications.status` soporta etapas intermedias nuevas (`auto_fill_in_progress` / `ready_to_review` / `submitted`) además de las 6 existentes
- [ ] **TRACK-06**: El dropdown de estado (UI) refleja y permite ver las etapas nuevas

### Callback API (CALLBACK) — v1.1

- [ ] **CALLBACK-01**: Un endpoint API gateado por bearer secret permite que una sesión externa de Claude Code actualice estado, notas y perfil de forma atómica (una transacción)
- [ ] **CALLBACK-02**: El endpoint valida transiciones de estado y payload del lado del servidor — no confía ciegamente en el caller, dado que quien llama es la interpretación de un LLM de una página web arbitraria

### Audit trail (AUDIT) — v1.1

- [ ] **AUDIT-01**: Cada escritura del callback registra exactamente qué datos se enviaron a esa aplicación específica (no solo el perfil global)
- [ ] **AUDIT-02**: El historial se referencia por `opportunity_external_id`, nunca por el id serial de cache (mismo anti-patrón que `applications`)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Discovery

- **DISC-05**: Relevancia/deprioritización automática de filas exclusivas para underclassmen (regla determinística sobre elegibilidad por ciclo)
- **DISC-06**: Badge de "nuevo desde tu última visita" (requiere guardar historial de snapshots, no solo el estado actual)
- **DISC-07**: Surfacing de deadlines/urgencia (sujeto a que la calidad de datos de origen lo permita — validar en Fase 1)

### Benefits

- **BENE-02**: Flag de elegibilidad probable para correos `.edu.pe` sobre cada beneficio (requiere curación manual, no es parseable)

### Notifications

- **NOTIF-01**: Alertas por email/push/Telegram cuando aparecen nuevas oportunidades relevantes

### Auto-apply (v1.2+)

- **APPLY-04**: Panel UI para expandir/inspeccionar "qué se envió" por aplicación (hoy solo se guarda, no se muestra)
- **APPLY-05**: Señal de "completitud de perfil" (cuántos tipos de pregunta conocidos ya responde) para guiar qué debe preguntar el agente
- **PROFILE-04**: Flag `sensitive: boolean` en campos de perfil, excluidos por default del prompt generado
- **TRACK-07**: Vista de "sesiones atascadas" — aplicaciones en `auto_fill_in_progress` hace demasiado tiempo

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Autenticación multi-usuario / cuentas de terceros | Herramienta personal de un solo usuario, no un producto para otros |
| Auto-submit sin revisión humana | Riesgo alto (ToS de cada ATS, errores irreversibles por oferta) — ver v1.1 APPLY-02/03: siempre auto-fill + revisión, nunca auto-submit directo |
| Bot persistente logueado en un ATS/LinkedIn (automatización "always-on") | Mismo patrón que gatilla bans de automatización en LinkedIn y otros ATS; v1.1 usa sesiones puntuales de Claude Code, nunca un bot logueado de forma permanente |
| CRM completo (contactos, red de networking) | El campo de notas ya cubre "recordar detalles de una postulación"; fuera del core value |
| Constructor de CV / matching ATS | Ortogonal al core value (agregación + tracking); alcance no solicitado |
| Curaduría continua de fuentes adicionales más allá de las 3 dadas | Investigar fuentes extra (GitHub Global Campus, otras awesome-lists) es research puntual, no mantenimiento de v1 |
| Deploy en Vercel o cualquier infraestructura serverless-only | Juan pidió explícitamente su hosting propio (Dokploy/Hetzner) + Cloudflare |
| Cifrado/gestión de secretos para campos de perfil genuinamente sensibles (SSN, historial salarial) | Se evalúa si hace falta persistirlos siquiera; no construir cripto especulativa sin un caso concreto |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ING-01 | Phase 1 | Complete |
| ING-02 | Phase 1 | Complete |
| ING-03 | Phase 1 | Complete |
| ING-04 | Phase 1 | Complete |
| ING-05 | Phase 1 | Complete |
| ING-06 | Phase 1 | Complete |
| DISC-01 | Phase 2 | Complete |
| DISC-02 | Phase 2 | Complete |
| DISC-03 | Phase 2 | Complete |
| DISC-04 | Phase 2 | Complete |
| BENE-01 | Phase 2 | Complete |
| TRACK-01 | Phase 3 (Plan 1) | Complete |
| TRACK-02 | Phase 3 (Plan 2) | Complete |
| TRACK-03 | Phase 3 (Plan 1 status / Plan 2 notas) | Complete |
| TRACK-04 | Phase 3 (Plan 1) | Complete |
| DEPLOY-01 | Phase 4 | Complete |
| DEPLOY-02 | Phase 4 | Complete |
| DEPLOY-03 | Phase 4 | Complete |
| PROFILE-01 | TBD (roadmap v1.1) | Pending |
| PROFILE-02 | TBD (roadmap v1.1) | Pending |
| PROFILE-03 | TBD (roadmap v1.1) | Pending |
| APPLY-01 | TBD (roadmap v1.1) | Pending |
| APPLY-02 | TBD (roadmap v1.1) | Pending |
| APPLY-03 | TBD (roadmap v1.1) | Pending |
| TRACK-05 | TBD (roadmap v1.1) | Pending |
| TRACK-06 | TBD (roadmap v1.1) | Pending |
| CALLBACK-01 | TBD (roadmap v1.1) | Pending |
| CALLBACK-02 | TBD (roadmap v1.1) | Pending |
| AUDIT-01 | TBD (roadmap v1.1) | Pending |
| AUDIT-02 | TBD (roadmap v1.1) | Pending |

**Coverage:**

- v1.0 requirements: 18 total — mapped to phases: 18 — unmapped: 0 ✓
- v1.1 requirements: 15 total — mapped to phases: 0 (pending roadmap creation) ⚠️

---
*Requirements defined: 2026-09-07*
*Last updated: 2026-09-08 after defining v1.1 requirements*
