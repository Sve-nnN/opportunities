# Stack Research

**Domain:** Personal single-user dashboard — live GitHub data aggregation + application tracking, self-hosted on Dokploy/Hetzner
**Researched:** 2026-09-07
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js (App Router) | 16.3.4 | Full-stack framework (UI + API routes/Server Actions + data fetching) | One codebase for frontend and backend, built-in caching primitives (`fetch` cache, `revalidate`) fit the "fetch GitHub data, cache it" requirement, and `output: 'standalone'` produces a minimal self-contained bundle purpose-built for Docker self-hosting — no Vercel lock-in. Confirmed via Context7 (`/vercel/next.js`) that standalone output is explicitly documented for "self-hosting in a Docker container." |
| React | 19.2.8 | UI library | Ships with Next.js 16; Server Components let you fetch/parse GitHub data on the server without shipping parsing libraries to the client bundle. |
| TypeScript | 5.x (latest via `create-next-app`) | Type safety | Non-negotiable for a project scraping loosely-structured markdown/JSON into typed domain objects (opportunity, benefit, application status). |
| PostgreSQL | 16 or 17 (whatever Dokploy provisions by default) | Persistence for application-tracking state | Already available as a one-click provisioned service in Dokploy per project constraints; relational model fits the tracking data (status enum + notes per opportunity, foreign key to a cached opportunity id) far better than a document store for a small, well-defined schema. |
| Drizzle ORM | 0.45.2 (+ drizzle-kit 0.31.10) | Type-safe DB access + migrations | Talks directly to Postgres over TCP via `node-postgres` (`pg`) — no bundled native binary engine to worry about in a Docker image (unlike Prisma's Rust query-engine binaries, which have historically caused arch-mismatch/Alpine musl issues in containers). Lighter runtime footprint, migrations are plain SQL files you can inspect and run against the self-hosted DB. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pg` (node-postgres) | 8.23.0 | Postgres driver | Required peer dependency for Drizzle's `drizzle-orm/node-postgres` adapter; pool connection to the Dokploy-managed Postgres instance. |
| `remark` + `remark-parse` + `remark-gfm` | 15.0.1 / 11.0.0 / 4.0.1 | Parse GitHub-flavored markdown tables (README of `Summer2027-Internships`, `underclassmen-opportunities`) into an AST (mdast), then walk the `table` node into structured rows | `remark-gfm` is the official unified/remark plugin that specifically enables GFM table syntax — without it, `remark-parse` alone does not understand pipe tables. This is the standard, actively maintained approach (part of the `unifiedjs` collective) rather than regex-scraping markdown by hand, which breaks on edge cases (cell alignment markers, escaped pipes, inline links/badges inside cells). |
| `zod` | 4.5.4 | Runtime validation of parsed GitHub data and API payloads | Markdown tables and `benefits.json` are external, unversioned, community-maintained data — validate/coerce every row before it enters app state so a malformed upstream edit doesn't crash rendering. Also validates Server Action input for the status/notes update form. |
| `@octokit/rest` or plain `fetch` to the GitHub REST API | latest | Fetch README/raw content with conditional requests | Use the `ETag`/`If-None-Match` pattern: GitHub returns `304 Not Modified` on unchanged content and 304 responses do not count against the primary rate limit. For a single-user personal tool, plain authenticated `fetch` (Node 18+ built-in) with a stored ETag is simpler than pulling in Octokit — recommend `@octokit/rest` only if you also want typed pagination/other GitHub endpoints later. |
| Next.js `fetch` cache + `revalidate` (built-in, no package) | — | Cache layer for GitHub responses | Next.js extends `fetch` with a data cache; set `next: { revalidate: 3600 }` (or similar) on GitHub requests instead of standing up Redis just for this — one instance, one user, no need for a distributed cache. Persist the last-known ETag/data in Postgres (a small `source_cache` table) so cache survives container restarts, since Next's in-memory/`.next` cache does not. |
| `cloudflare` (official Node SDK) | 7.1.0 | Programmatic DNS record creation on `juan-tech.com` subdomain | Official TypeScript SDK, `client.dns.records.create({ zone_id, type: 'A'|'CNAME', name, content, proxied })`. This is a one-time/rarely-run provisioning script (run locally or in a setup step), not part of the running app — do not bundle it into the Next.js runtime image. |
| shadcn/ui (CLI `shadcn`) + Tailwind CSS | shadcn 4.21.0, tailwindcss 4.3.3 | Dashboard UI components (tables, filters, status badges, forms) | Copy-in component model (not an npm runtime dependency) means no version-lock risk in a long-lived self-hosted app; Tailwind v4 uses the new CSS-first config (`@import "tailwindcss"`, no `tailwind.config.js` needed for basics), confirmed current via Context7 (`/shadcn-ui/ui`). Fast to build a filterable/sortable opportunities table and a Kanban-ish status view. |
| `@tanstack/react-query` | 5.102.8 | Client-side state for optimistic status/notes updates | Only needed if you want optimistic UI when marking an application status change; if you're fine with Server Actions + `revalidatePath` round-trips, skip this and reduce bundle size — see "Stack Patterns by Variant." |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| pnpm | Package manager | Faster installs, smaller `node_modules`, works cleanly with Docker layer caching (`pnpm-lock.yaml` copied before `pnpm install`). |
| Docker (multi-stage build) | Containerize the app for Dokploy | Use the official Next.js `with-docker` example Dockerfile (3-stage: deps → build → runner with `output: 'standalone'`, non-root `node` user, `CMD ["node", "server.js"]`). This is the exact pattern Dokploy's own Next.js docs assume. |
| Drizzle Kit CLI | Generate/apply SQL migrations | Run `drizzle-kit generate` in CI/locally, apply with `drizzle-kit migrate` (or programmatic `migrate()`) as a one-off container/init step in Dokploy, not on every app boot. |

## Installation

```bash
# Scaffold (App Router, TS, Tailwind, src/ dir recommended)
pnpm dlx create-next-app@latest opportunities --typescript --tailwind --app --src-dir

# Core data + validation
pnpm add drizzle-orm pg zod
pnpm add -D drizzle-kit @types/pg

# Markdown table parsing
pnpm add unified remark-parse remark-gfm

# UI (adds components as source, not a runtime dep)
pnpm dlx shadcn@latest init

# Optional: GitHub typed client (skip if using plain fetch)
pnpm add @octokit/rest

# One-off DNS provisioning script (dev dependency or separate script, not app runtime)
pnpm add -D cloudflare
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|--------------------------|
| Drizzle ORM | Prisma | If you strongly prefer Prisma's DX (Studio GUI, more mature docs) and are willing to pin the correct `binaryTargets` (e.g. `linux-musl-openssl-3.0.x` for Alpine, or `debian-openssl-3.0.x` for a `node:*-slim` base) in `schema.prisma` for your exact Docker base image — this project's Dockerfile uses `node:*-slim` (Debian-based, glibc), so the binary-mismatch failure mode is avoidable, just an extra config step Drizzle doesn't require. |
| `remark` + `remark-gfm` | `marked` + custom table regex, or `markdown-table` | `marked` is faster for simple render-to-HTML use cases but its table token output is less structured for programmatic extraction than an mdast tree; only reach for it if you just need to render the README as HTML rather than extract rows into typed objects. |
| Plain `fetch` with ETag caching | `@octokit/rest` | Once the app needs more GitHub endpoints (e.g. checking repo last-commit date, pagination across multiple files) or built-in retry/throttling plugins (`@octokit/plugin-throttling`), Octokit's typed surface pays for itself. |
| Next.js `fetch` cache + Postgres cache table | Redis (Dokploy-provisioned) | If GitHub fetch volume grows (e.g. you add more source repos, or want sub-minute refresh with many concurrent readers) a shared Redis cache decouples cache TTL from app restarts more cleanly than a DB table — Dokploy can provision Redis natively, so this is a low-effort upgrade path, not a rewrite. |
| Server Actions + `revalidatePath` | `@tanstack/react-query` | Use React Query if you want instant optimistic UI feedback on status changes without a full page-data revalidation round trip, or if you anticipate polling/background refetch needs beyond simple mutations. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Vercel-specific APIs (`@vercel/kv`, `@vercel/postgres`, Vercel Cron, Edge Config, ISR relying on Vercel's CDN invalidation) | Explicitly out of scope per project constraints — these either don't work at all outside Vercel's platform or silently no-op/error in a self-hosted container. | Standard Node.js APIs, Dokploy-provisioned Postgres/Redis, and a self-managed cron (a lightweight in-app `setInterval`/scheduled route, or a Dokploy cron job hitting a revalidation endpoint) for periodic refresh. |
| Next.js Edge Runtime for data-fetching/API routes that need `pg`/Drizzle | The `pg` driver requires Node.js TCP sockets, which the Edge Runtime does not support (Edge is a V8 isolate, not full Node). | Node.js runtime (`export const runtime = 'nodejs'`, the default) for any route touching Postgres. |
| localStorage-only persistence for application status | Explicitly called out as insufficient in project constraints — no multi-device sync. | Postgres via Drizzle, as above. |
| Prisma without pinning `binaryTargets` in a Docker context | Silent `Error: Unable to require libquery_engine...` failures when the build machine's OS/libc differs from the container's, common when devs build on macOS ARM and deploy to a Debian/Alpine container. | Drizzle (no native engine binary), or Prisma with explicit `binaryTargets` matching your exact base image. |
| Hand-rolled regex parsing of markdown tables | Breaks silently on GFM edge cases (badges/images inside cells, escaped `\|`, alignment rows, nested links) that are common in community-maintained READMEs like `Summer2027-Internships`, which updates daily via PRs from many contributors with inconsistent formatting. | `remark-parse` + `remark-gfm`, which implements the GFM table spec. |

## Stack Patterns by Variant

**If you want the simplest possible v1 (no client-side cache library):**
- Use Server Actions for status/notes updates + `revalidatePath`/`revalidateTag` to refresh the UI after a mutation.
- Because for a single user with no concurrent multi-tab editing pressure, the extra round trip is imperceptible and you avoid shipping/configuring React Query.

**If GitHub source count or refresh frequency grows beyond the 3 current sources:**
- Add a Dokploy-provisioned Redis instance as the cache layer instead of a Postgres `source_cache` table, and consider `@octokit/plugin-throttling` for automatic backoff.
- Because a dedicated cache store scales refresh/TTL logic independently of your relational schema and handles concurrent-fetch coalescing better than ad hoc DB rows.

**If you later add push/email notifications (flagged as v2 in project scope):**
- Add a scheduled job runner (Dokploy cron hitting an internal API route, or `node-cron` inside a small worker process) rather than relying on serverless cron — there is no serverless platform here to provide it.
- Because the self-hosted long-lived container model means "cron" must be either an OS-level/Dokploy-level schedule or an in-process interval, not a platform primitive.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|------------------|-------|
| next@16.3.4 | react@19.2.8, react-dom@19.2.8 | Next.js 16 requires React 19; `create-next-app@latest` wires this up automatically. |
| drizzle-orm@0.45.2 | drizzle-kit@0.31.10, pg@8.23.0 | Use the `drizzle-orm/node-postgres` entrypoint (not `drizzle-orm/postgres-js`) when driving the connection through `pg`/`Pool`. |
| tailwindcss@4.3.3 | shadcn CLI@4.21.0 | Tailwind v4's CSS-first config (`@import "tailwindcss"` in globals.css) is what the current shadcn `next` installer scaffolds by default — do not mix in a v3-style `tailwind.config.js` content-globs setup, it's unnecessary in v4. |
| Next.js `output: 'standalone'` | Docker multi-stage build copying `.next/standalone` + `.next/static` + `public` | Must manually copy `public/` and `.next/static/` into the standalone output — they are not included automatically, per Next.js docs. |

## Sources

- Context7 `/vercel/next.js` — standalone output config, Docker multi-stage Dockerfile example, self-hosting guidance (HIGH confidence, official docs)
- Context7 `/drizzle-team/drizzle-orm-docs` — node-postgres connection setup, drizzle-kit config, programmatic migrations (HIGH confidence, official docs)
- Context7 `/shadcn-ui/ui` — Tailwind v4 CSS-first install, Next.js installation flow (HIGH confidence, official docs)
- npm registry (`npm view`) — verified current published versions as of 2026-09-07 for next, react, drizzle-orm, drizzle-kit, pg, cloudflare, remark/remark-gfm/remark-parse/unified, tailwindcss, shadcn, zod, @tanstack/react-query (HIGH confidence, primary source)
- [docs.github.com REST API best practices](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api) — ETag/conditional request rate-limit behavior (HIGH confidence, official docs)
- [developers.cloudflare.com DNS records create](https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/create/) — `client.dns.records.create()` Node SDK usage (HIGH confidence, official docs)
- [docs.dokploy.com Next.js guide](https://docs.dokploy.com/docs/core/nextjs) — Dokploy's own Next.js deployment expectations (Dockerfile vs Nixpacks, internal service networking for Postgres) (HIGH confidence, official docs)
- [remark-gfm npm](https://www.npmjs.com/package/remark-gfm), [unifiedjs.com table recipe](https://unifiedjs.com/learn/recipe/remark-table/) — GFM table parsing approach (HIGH confidence, official project docs)

---
*Stack research for: personal opportunities/benefits dashboard*
*Researched: 2026-09-07*
