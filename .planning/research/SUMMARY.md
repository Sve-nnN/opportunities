# Project Research Summary

**Project:** Opportunities Hub
**Domain:** Personal single-user aggregation dashboard (external GitHub data ingestion + application tracking), self-hosted
**Researched:** 2026-09-07
**Confidence:** HIGH

## Executive Summary

This is a small full-stack web app, not a scraper script: a scheduled ingestion layer pulls three community-maintained GitHub sources (two markdown tables, one JSON catalog) into a Postgres cache, and a server-rendered dashboard reads only from that cache — never live from GitHub on page load. The recommended stack is Next.js 16 (App Router, `output: 'standalone'`) + Drizzle ORM + Postgres, built specifically to run as a Docker container on Juan's own Dokploy/Hetzner host rather than Vercel; nothing in the stack depends on Vercel-only primitives.

The core architectural decision is "pull-and-cache, never fetch-on-request": GitHub's unauthenticated rate limit (60 req/hr) and the fragility of hand-parsing community-edited markdown tables both point the same direction — ingest on a schedule (hourly is plenty), normalize into a common schema keyed by a stable `external_id`, and serve fast DB reads to the UI. Application tracking (status + notes) is a second, independent data path into the same Postgres instance, decoupled from the refresh job so a sync can never clobber Juan's own tracked state — this also directly satisfies the cross-device sync requirement, since it's DB-backed from day one, not localStorage.

The main risks are all upstream-data risks, not infra risks: GitHub markdown tables drift format without warning (mitigated by preferring SimplifyJobs' underlying `listings.json` over its rendered README, and using a real markdown-table parser — `remark` + `remark-gfm` — for the one source that has no JSON alternative), and GitHub's unauthenticated rate limit is trivially exhausted by naive per-request fetching (mitigated by a PAT + scheduled sync + ETags). Deploy-side, the only real gotcha is Cloudflare/Traefik SSL-mode mismatch, which is a one-time config check, not an ongoing concern.

## Key Findings

### Recommended Stack

Next.js 16 (App Router) + React 19 + TypeScript, with `output: 'standalone'` producing a minimal Docker image explicitly documented for self-hosting — this covers both the UI and the API/server-action layer in one codebase, and gives a built-in `fetch` cache useful for the ingestion layer. Persistence is Postgres (Dokploy-provisioned) via Drizzle ORM, chosen over Prisma specifically to avoid native-binary/Docker-arch mismatches in a self-hosted container. Markdown table parsing uses `remark` + `remark-gfm` (real GFM-aware parsing, not regex) for the one source without a JSON alternative; `zod` validates all externally-sourced data before it enters app state.

**Core technologies:**
- Next.js 16 (App Router, `output: 'standalone'`): full-stack framework, UI + API/server actions — self-hosting is an explicitly documented, first-class deploy target, not a workaround
- Drizzle ORM + `pg` (node-postgres): type-safe DB access with plain SQL migrations and no native-binary Docker risk
- PostgreSQL (Dokploy-provisioned): relational fit for a small, well-defined schema (opportunities/benefits cache + applications tracking)
- `remark` + `remark-gfm`: GFM-aware markdown table parsing for sources without a JSON alternative — avoids the silent-breakage failure mode of regex parsing
- shadcn/ui + Tailwind v4: fast to build a filterable table + status UI without adding a long-term npm runtime dependency

### Expected Features

The dashboard's whole value proposition is merging discovery (live listings) and tracking (personal application status) into one page — most competitor tools (Huntr, Teal, Simplify) keep those as separate products. That merge is the actual differentiator, not an add-on feature.

**Must have (table stakes):**
- Live-refreshed listing table across all 3 sources, always current — the entire premise of the tool
- Search/filter by category, type, open/closed status — without it, 1200+ rows is unusable
- Closed/inactive indicator per listing, with direct apply link
- Personal application status tracking (applied/in process/rejected/accepted) + notes field
- Cross-device DB-backed persistence (explicitly not localStorage)
- Freshness indicator ("last synced X ago") — trust signal that "live" really means live

**Should have (competitive):**
- Relevance highlighting/deprioritization for underclassmen-only rows (Juan is past that eligibility window)
- Saved/starred shortlist distinct from "applied"
- "New since last visit" badge (requires storing fetch snapshot history, not just latest state)

**Defer (v2+):**
- .edu.pe eligibility overlay for benefits (needs manual curation, not a parsing task)
- Push/email/Telegram alerts (explicitly deferred in PROJECT.md pending v1 validation)
- Deadline/urgency surfacing (feasibility depends on whether source data actually has usable dates — verify in Phase 1 before committing UI to it)

### Architecture Approach

A four-layer pipeline: **ingestion** (three isolated per-source parsers → a single `normalize.ts` mapping everything into one `Opportunity`/`Benefit` schema) → **scheduled sync job** (cron, upserts into Postgres, marks missing rows `is_active=false` rather than hard-deleting) → **API layer** (thin REST/RPC over Postgres, plus application CRUD) → **UI** (filterable dashboard + status picker). Everything runs as a single container/process at this scale — no queue, no separate worker needed.

**Major components:**
1. Source parsers (×3, isolated in `ingestion/sources/`) — fetch + parse each source's raw shape, tolerant of schema drift
2. Normalize + sync (`ingestion/normalize.ts`, `ingestion/sync.ts`) — one seam mapping all sources to a common schema, computing a stable `external_id`
3. Postgres cache tables (opportunities, benefits, applications) — UI/API never talk to GitHub directly, only to this cache
4. API layer + UI — filtered reads, application CRUD, all backed by the DB, not GitHub

### Critical Pitfalls

1. **Unauthenticated GitHub rate limit (60/hr) exhausted almost immediately** — use a fine-scoped, expiring PAT server-side (raises limit to 5,000/hr) and never fetch on page load, only on a schedule.
2. **Markdown table parser breaks silently on upstream format drift** — prefer SimplifyJobs' actual `.github/scripts/listings.json` over parsing its rendered README; use `remark-gfm` (not regex) for the source that has no JSON alternative; add a parse sanity check so one malformed row doesn't kill the whole sync.
3. **"Live" reinterpreted as fetch-on-every-request** — decouple ingestion (scheduled, writes to DB) from serving (UI always reads DB, never GitHub); surface `last_synced_at` in the UI.
4. **Cloudflare proxy + Dokploy/Traefik SSL mode mismatch** — use Cloudflare "Full (strict)" with Let's Encrypt on the Traefik side (Dokploy default); avoid Cloudflare Origin CA certs (fragile, known Dokploy issues).
5. **Plaintext secrets (GitHub PAT, DB creds) in Dokploy env vars with no rotation plan** — scope the PAT read-only/fine-grained with an expiration date; never commit secrets to git.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Ingestion Foundation
**Rationale:** Every other feature (filtering, tracking, UI) depends on structured data existing in Postgres first — research is unanimous that this must be pull-and-cache from day one, not retrofitted (Pitfalls 1 & 3).
**Delivers:** Postgres schema (opportunities, benefits, sync_log), three source parsers (prefer SimplifyJobs' `listings.json` over README scraping; `remark-gfm` for underclassmen-opportunities; plain JSON.parse for student-benefits), normalize.ts producing a common schema with stable `external_id`, a scheduled + manually-triggerable sync job.
**Addresses:** Live-refreshed listing table, freshness indicator (FEATURES.md table stakes)
**Avoids:** Pitfalls 1, 2, 3 (rate limits, parser fragility, fetch-on-request anti-pattern)

### Phase 2: Dashboard UI — Discovery
**Rationale:** With data reliably in Postgres, build the read-only browsing experience before adding write paths (tracking) — validates the ingestion schema against real UI needs first.
**Delivers:** Filterable/searchable listing UI (category, type, open/closed), source/category distinction (tabs), closed/inactive badges, last-synced indicator.
**Uses:** Next.js Server Components + shadcn/ui + Tailwind from STACK.md
**Implements:** API/UI layers from ARCHITECTURE.md

### Phase 3: Application Tracking
**Rationale:** Second core requirement from PROJECT.md; deliberately built as an independent write path into the same Postgres instance so sync and tracking can never conflict (Architecture Pattern 3 / Anti-Pattern 2).
**Delivers:** `applications` table keyed by `external_id` (not cache row ID), status field (applied/in process/rejected/accepted) + notes, Server Action or API route for CRUD, UI status picker per row.
**Uses:** Drizzle schema + migrations from STACK.md
**Implements:** Application Store component from ARCHITECTURE.md; satisfies cross-device sync requirement directly since it's DB-backed, not localStorage (Anti-Pattern 3)

### Phase 4: Deploy — Dokploy + Cloudflare
**Rationale:** All prior phases are deployable as one Docker container; deploy is deliberately last so the SSL/DNS/secrets checklist (Pitfalls 4, 5, 6) is verified once against a feature-complete app rather than iterated on repeatedly.
**Delivers:** Multi-stage Dockerfile (Next.js `standalone` output), Dokploy project + app configured via the API (per `hosting/infra/API-DEPLOY-GUIDE.md`), Postgres provisioned as a Dokploy-native DB, Cloudflare DNS record for a `juan-tech.com` subdomain with SSL mode "Full (strict)" + Let's Encrypt, GitHub PAT and DB credentials set as scoped/expiring Dokploy env vars.
**Rationale:** Confirms the self-hosted deploy target works end-to-end (HTTPS, no redirect loop, sync job running in production) as an explicit acceptance check, not an assumption.

### Phase Ordering Rationale

- Ingestion must come first: filtering, tracking, and UI all assume structured Postgres data exists — building UI against live/unstable GitHub fetches would mean rebuilding it once caching lands (FEATURES.md dependency graph, ARCHITECTURE.md Pattern 1).
- Discovery UI before tracking: tracking's `applications` table references `external_id` values that only exist once ingestion + normalization are running; validating the read path first surfaces schema issues before a second feature depends on the same IDs.
- Tracking before deploy: deploy-phase pitfalls (SSL, secrets) are one-time due-diligence checks best done once against a complete app, not re-verified after every subsequent feature phase.
- Deploy last, not "whenever it's convenient": research treats self-hosted deploy as needing an explicit acceptance check (HTTPS works, sync runs reliably over 24h) — bundling it with earlier phases risks skipping that check under feature-development pressure.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1 (Ingestion):** Needs to confirm at planning time whether SimplifyJobs' `.github/scripts/listings.json` path/schema is still current (repos restructure), and whether `underclassmen-opportunities` table columns are stable enough for a first-pass parser — treat as a spike within the phase, not a blocking pre-research task.
- **Phase 4 (Deploy):** Needs to read `hosting/infra/API-DEPLOY-GUIDE.md` and related RUNBOOKs in full at plan time (only skimmed during project research) to get exact Dokploy API call sequences right.

Phases with standard patterns (skip research-phase):
- **Phase 2 (Dashboard UI):** Standard Next.js + shadcn filterable-table pattern, well-documented.
- **Phase 3 (Application Tracking):** Standard CRUD-over-Postgres pattern with Drizzle, no novel integration.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Versions and self-hosting guidance verified via Context7 official docs (Next.js, Drizzle, shadcn) and npm registry |
| Features | MEDIUM | Cross-checked against multiple job-tracker products (Huntr, Teal, Simplify) and the named source repos directly; no access to competitor internal usage data |
| Architecture | HIGH | Standard, widely-used ETL/cache-then-serve pattern; general software architecture reasoning rather than library-specific claims |
| Pitfalls | HIGH (technical) / MEDIUM (licensing) | GitHub rate limits, markdown parsing, Cloudflare/Traefik behavior are well-documented; ToS/licensing re-display risk is genuinely ambiguous and untested for this exact use case |

**Overall confidence:** HIGH

### Gaps to Address

- Whether SimplifyJobs' `Summer2027-Internships` truly exposes a stable `.github/scripts/listings.json` (vs. README-only) needs a direct check at Phase 1 planning time, not assumed from this research pass.
- Whether source tables reliably contain parseable deadline data is unconfirmed — treat "deadline surfacing" as a P3/deferred feature until Phase 1 data-quality check resolves it.
- License/ToS status of each of the 3 source repos should be checked and documented once during Phase 1 (due-diligence checklist item, not a blocking gate given single-user/no-public-signup scope).

## Sources

### Primary (HIGH confidence)
- Context7 `/vercel/next.js` — standalone output, Docker self-hosting guidance
- Context7 `/drizzle-team/drizzle-orm-docs` — node-postgres setup, migrations
- Context7 `/shadcn-ui/ui` — Tailwind v4 CSS-first install
- docs.github.com REST API rate limits / best practices
- developers.cloudflare.com DNS API docs
- docs.dokploy.com (Next.js guide, environment variables, Cloudflare domains)
- PROJECT.md — project's own stated requirements, constraints, out-of-scope list

### Secondary (MEDIUM confidence)
- Huntr / Teal / Simplify product pages and third-party comparisons — competitor feature patterns
- SimplifyJobs `Summer2026-Internships` CONTRIBUTING.md — inferred `listings.json` data-source pattern

### Tertiary (LOW confidence)
- GitHub site-policy scraping issue thread — ToS/licensing interpretation, genuinely unsettled, flagged as a gap above

---
*Research completed: 2026-09-07*
*Ready for roadmap: yes*
