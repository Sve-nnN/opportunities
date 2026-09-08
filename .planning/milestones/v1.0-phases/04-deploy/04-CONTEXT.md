# Phase 4: Deploy - Context

**Gathered:** 2026-09-08
**Status:** Ready for planning

<domain>
## Phase Boundary

La app corre en producción en la infraestructura propia de Juan (Dokploy sobre Hetzner), accesible con HTTPS en `opportunities.juan-tech.com` vía Cloudflare. Cubre DEPLOY-01 a DEPLOY-03. Fase de infraestructura pura, sin cambios de comportamiento de usuario.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
Fase de infraestructura — sin comportamiento visible para el usuario más allá de "la app funciona en su URL real". Seguir `hosting/infra/API-DEPLOY-GUIDE.md` y RUNBOOKs relacionados (leer completos al planificar, solo se hojearon durante research) para la secuencia exacta de llamadas a la API de Dokploy.

Decisiones ya tomadas y no negociables:
- **Subdominio**: `opportunities.juan-tech.com`
- **DB de producción**: ya provisionada — tenant `opportunities` en `shared-postgres` del VPS `sapling-vps-01` (116.203.79.125), acceso SSH disponible vía `~/.ssh/sapling_ed25519` como `juan@116.203.79.125`. `DATABASE_URL` real: `postgresql://opportunities_user:***@shared-postgres:5432/opportunities` (usar el valor real ya generado, no reprovisionar — ver STATE.md/histórico de la sesión si se perdió, o volver a correr `bash ~/infra-db/new-tenant-postgres.sh opportunities` que es idempotente y no rota la password si el tenant ya existe)
- **GITHUB_PAT**: Juan ya generó un token fine-grained, read-only, público — pedírselo de nuevo o confirmar que sigue vigente antes de setearlo en Dokploy (nunca commitear a git)
- **SSL**: Cloudflare "Full (strict)" + Let's Encrypt vía Traefik/Dokploy — NUNCA Cloudflare Origin CA certs (research/PITFALLS.md Pitfall 5, issue conocido con Dokploy)
- **Dockerfile**: ya existe desde Phase 1 (`output: 'standalone'`) — verificar en esta fase que copia `.next/static/` y `public/` al output standalone (gap confirmado por el verifier de Phase 3, Next.js no lo hace automático)
- **Build de Docker necesita acceso a red** porque `next/font/google` descarga fuentes en build time (decisión de Phase 2, self-hosted en runtime pero fetch en build)
- **Secretos como env vars en Dokploy**: `DATABASE_URL`, `GITHUB_PAT`, `SYNC_TRIGGER_SECRET` — nunca en git, PAT con scope mínimo y expiración

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Dockerfile` (Phase 1) — multi-stage, `output: 'standalone'`, no root user
- `hosting/infra/API-DEPLOY-GUIDE.md`, `hosting/infra/dokploy/*`, `hosting/infra/db/*` — mecánica completa de la API de Dokploy, leer en detalle al planificar (solo se resumió durante research del proyecto)
- SSH ya verificado funcional a `juan@116.203.79.125` con `~/.ssh/sapling_ed25519`

### Established Patterns
- Todos los deploys de Juan en este VPS pasan por la API de Dokploy (`x-api-key` header), nunca por la UI ni SSH directo salvo para comandos puntuales (provisioning de DB, ya hecho)

### Integration Points
- `vercel.ts`/config de Vercel: N/A, no aplica a este proyecto
- Cloudflare: crear registro DNS para `opportunities.juan-tech.com` vía API de Cloudflare (SDK `cloudflare` ya en package.json como dev dependency, per research/STACK.md) o vía Dokploy's Cloudflare integration si existe

</code_context>

<specifics>
## Specific Ideas

Ninguna adicional — seguir exactamente el patrón ya establecido en `hosting/infra/` para otros proyectos de Juan.

</specifics>

<deferred>
## Deferred Ideas

Ninguna — esta es la última fase del roadmap v1.

</deferred>
