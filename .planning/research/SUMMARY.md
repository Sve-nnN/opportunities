# Project Research Summary

**Project:** opportunities (personal internship/benefits aggregation dashboard + application tracker)
**Domain:** Personal single-user dashboard — live GitHub data aggregation + application tracking, self-hosted on Dokploy/Hetzner
**Researched:** 2026-09-07
**Confidence:** HIGH

## Executive Summary

This is a single-user ETL-into-cache dashboard: three external GitHub sources (two community-maintained markdown tables — `Summer2027-Internships`, `underclassmen-opportunities` — and one JSON catalog, `student-benefits`) are periodically fetched, parsed, normalized, and stored in Postgres, and the UI/API only ever reads from that cache. This pattern is well-established for GitHub-scraping dashboards: it decouples dashboard uptime from GitHub's availability and rate limits, and it is the only architecture that satisfies the project's own explicit requirements (live data, cross-device sync, no localStorage). The recommended stack — Next.js 16 (App Router) + React 19 + Drizzle ORM + Postgres + remark/remark-gfm for table parsing — is chosen specifically to avoid Vercel lock-in and Docker-native-binary pitfalls, fitting a self-hosted Dokploy/Hetzner deployment.

The core build has two independent halves that share one piece of infrastructure: (1) ingestion — three source parsers feeding a normalization layer into cache tables, driven by a scheduled job with a manual "refresh now" trigger, and (2) application tracking — a small, DB-backed CRUD layer for status/notes, keyed to a stable `external_id` (never a DB auto-increment) so tracked applications survive cache re-syncs. Because both features need the same Postgres instance, building the persistence layer once satisfies both the "personal tracking" and "cross-device sync" requirements simultaneously.

The main risks are all foreseeable and cheap to prevent up front, but expensive to retrofit: GitHub's 60/hour unauthenticated rate limit (fix: PAT + scheduled fetch, never fetch-on-request), markdown table parsing fragility on community-edited README tables (fix: use SimplifyJobs' underlying `listings.json` instead of scraping their rendered table; use a real markdown parser, not regex, for `underclassmen-opportunities`), and Cloudflare/Traefik SSL misconfiguration at deploy time. All three are "decide correctly in Phase 1, or rebuild later" issues, not incremental refinements — the architecture and pitfalls research agree these belong in the ingestion/fetch-layer phase itself, not bolted on afterward.

## Key Findings

### Recommended Stack

Next.js 16 (App Router) is the full-stack framework of choice: one codebase for UI + API/Server Actions, built-in `fetch` caching that fits the "fetch GitHub, cache it" requirement, and `output: 'standalone'` purpose-built for Docker self-hosting (avoiding any Vercel-specific API). Drizzle ORM over Prisma specifically to sidestep Docker native-binary architecture mismatches (Prisma's Rust query engine binaries have a known failure mode across build-machine vs. container OS/libc). `remark` + `remark-gfm` for markdown table parsing rather than hand-rolled regex, since GFM tables have edge cases (badges, escaped pipes, alignment rows) regex breaks on.

**Core technologies:**
- Next.js 16 (App Router) + React 19: unified frontend/backend, Docker-native standalone output — avoids Vercel lock-in
- Drizzle ORM 0.45.2 + `pg` + Postgres 16/17: type-safe DB access with no native-binary Docker risk, fits Dokploy's provisioned Postgres
- `remark` + `remark-parse` + `remark-gfm`: robust GFM markdown table → AST parsing for the two README sources
- `zod`: runtime validation of external, unversioned, community-maintained data before it enters app state
- Tailwind CSS 4 + shadcn/ui: copy-in components (no runtime version lock) for filterable tables and status UI

### Expected Features

**Must have (table stakes):**
- Live-refreshed listing table across all 3 sources — the entire premise of the tool
- Search/filter by category, type, open/closed status — 1200+ rows is unusable without it
- Closed/inactive indicator per listing, direct apply link, freshness ("last synced") indicator
- Personal application status tracking (applied/in process/rejected/accepted) + notes field
- Cross-device DB-backed persistence (explicitly not localStorage)

**Should have (competitive/differentiator):**
- Relevance deprioritization for underclassmen-only rows (rule-based, not ML)
- Saved/starred shortlist distinct from "applied"
- "New since last visit" badge (requires snapshot history, not just latest-state overwrite)
- Single combined discovery + tracking view — this is the product's actual central differentiator vs. competitors like Simplify/Huntr, which split browse and track into separate products

**Defer (v2+):**
- .edu.pe eligibility overlay for benefits (needs manual curation, not parsing)
- Push/email/Telegram alerts (explicitly deferred in PROJECT.md)
- Deadline/urgency surfacing (contingent on unverified source data quality — check in Phase 1 before committing UI space)
- Explicitly out of scope entirely: multi-user auth, auto-apply/autofill, resume/ATS tooling, full CRM, maintaining additional source repos

### Architecture Approach

Scheduled ETL into a cache table, never fetch-on-request: a background job (cron, e.g. every 1-4 hours, plus a manual "refresh now" endpoint calling the identical function) fetches the 3 GitHub sources, normalizes them into a common `Opportunity`/`Benefit` schema, and upserts into Postgres keyed on a stable, content-derived `external_id` — never a DB auto-increment, since the `applications` table foreign-keys against `external_id` and must survive cache churn. Rows missing from a fresh sync are soft-deleted (`is_active = false`), not hard-deleted, so a user's tracked application never gets orphaned by an upstream removal.

**Major components:**
1. Ingestion layer (`ingestion/sources/*`, `normalize.ts`, `sync.ts`) — isolated from API/UI so fragile source-format drift fails loudly in one place
2. Data layer (Postgres: `opportunities`, `benefits`, `applications`, `sync_log` tables) — the only thing the UI ever reads from
3. API layer (`api/opportunities.ts`, `api/benefits.ts`, `api/applications.ts`, `api/sync.ts`) — thin handlers over `db/queries/`
4. Jobs (`jobs/scheduled-sync.ts`) — thin cron wrapper calling the same `runSync()` used by the manual trigger, so there's no duplicated ingestion logic

### Critical Pitfalls

1. **Unauthenticated GitHub rate-limit exhaustion (60/hr)** — always use a read-only, fine-scoped, expiring PAT server-side (raises limit to 5,000/hr) and never fetch GitHub on page-load; fetch only from the scheduled/manual sync job.
2. **Markdown table parser breaks silently on upstream format drift** — prefer SimplifyJobs' actual underlying `.github/scripts/listings.json` over parsing their rendered README table; for `underclassmen-opportunities` (markdown-only), use `remark`/`remark-gfm` with defensive HTML-stripping and a column-count sanity check, never hand-rolled regex.
3. **"Live" reinterpreted as fetch-per-request instead of fetch-on-schedule-serve-from-cache** — decouple ingestion from serving entirely; store and surface `last_synced_at` per source so freshness is a visible, honest signal rather than an assumption.
4. **Cloudflare/Traefik SSL misconfiguration** — use Cloudflare "Full (strict)" mode with Let's Encrypt via Traefik (Dokploy default); avoid Cloudflare Origin CA certs, which are known to break on Dokploy updates.
5. **Plaintext secrets with no rotation plan** — Dokploy env vars are plaintext-visible to anyone with dashboard access; scope the GitHub PAT to read-only public metadata with an expiration date, and gate any internal `/sync` or `/debug` route behind a shared secret even for a single-user app.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Ingestion foundation (parsers + normalization + cache schema)
**Rationale:** Every other feature (listing table, filters, tracking) depends on normalized data existing in Postgres first; the architecture and pitfalls research both flag the `external_id`/snapshot-history schema design as a "decide now or rebuild later" decision, so it must be settled before any UI work begins.
**Delivers:** Three source parsers (SimplifyJobs via `listings.json`, underclassmen-opportunities via `remark-gfm`, student-benefits via `JSON.parse`), a `normalize.ts` common schema, Postgres cache tables (`opportunities`, `benefits`, `sync_log`) with stable `external_id` and `is_active` soft-delete, and a scheduled + manual sync job authenticated via a fine-scoped GitHub PAT.
**Addresses:** Live-refreshed listing table, closed/inactive indicator, freshness indicator (all P1 in FEATURES.md)
**Avoids:** Pitfall 1 (rate limits), Pitfall 2 (parser fragility), Pitfall 3 (fetch-per-request anti-pattern)

### Phase 2: Dashboard UI — listing, search, filter
**Rationale:** Once the cache layer exists, the read path (API → Postgres → UI) is straightforward and matches the FEATURES.md P1 priority (search/filter is "LOW-MEDIUM" cost once data exists).
**Delivers:** Filterable/searchable listing table and benefits view (shadcn/ui + Tailwind), category/type/status filters, last-synced indicator in UI, source attribution per pitfalls research (licensing/ToS due diligence).
**Uses:** Next.js Server Components, shadcn/ui, Tailwind v4
**Implements:** API layer (`api/opportunities.ts`, `api/benefits.ts`), UI layer components

### Phase 3: Application tracking + persistence
**Rationale:** Depends on Phase 1's `external_id` scheme (tracking foreign-keys against it, not a cache row ID) but is otherwise independent of Phase 2's UI polish — can be built in parallel with or immediately after the listing view since it shares the same Postgres instance.
**Delivers:** `applications` table (status enum + notes), Server Actions or `api/applications.ts` CRUD, status picker UI wired into the listing cards from Phase 2.
**Uses:** Drizzle ORM, zod validation on mutation input
**Implements:** Application Store component, cross-device sync (satisfies two Active requirements — tracking and sync — as one piece of infrastructure)

### Phase 4: Deploy (Dokploy + Cloudflare)
**Rationale:** Deploy-phase pitfalls (SSL mode, secrets hygiene) are explicitly called out as acceptance checks, not something to verify implicitly; doing this as its own phase forces an explicit HTTPS/PAT-scope check rather than assuming infra "just works" because Dokploy and Cloudflare are separately configured.
**Delivers:** Multi-stage Dockerfile (`output: 'standalone'`), Dokploy-provisioned Postgres wired via env var, Cloudflare DNS subdomain on `juan-tech.com` in "Full (strict)" SSL mode with Let's Encrypt, PAT and DB credentials scoped/expiring in Dokploy env vars.
**Avoids:** Pitfall 5 (SSL/Cloudflare misconfiguration), Pitfall 6 (secrets hygiene)

### Phase Ordering Rationale

- Ingestion must come first because both the listing UI and application tracking depend on the `external_id`/normalized-schema decisions baked into it — retrofitting either later risks breaking foreign keys or losing snapshot history needed for the deferred "new since last visit" feature.
- Tracking (Phase 3) can technically run in parallel with the listing UI (Phase 2) since both only depend on Phase 1's schema, not on each other — flag this to the roadmapper as a possible phase-merge or parallelization opportunity if timeline pressure exists.
- Deploy is deliberately last so the sync job, listing UI, and tracking flow can all be verified locally against a real cache/DB before introducing the Cloudflare/Dokploy variable, per the pitfalls research's explicit deploy-phase acceptance checklist.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1:** Needs a Phase-1-internal data-quality check on `underclassmen-opportunities` and `Summer2027-Internships` — specifically verifying `listings.json` field names/shape and whether deadline data is reliably present (FEATURES.md flags deadline surfacing as contingent on this).

Phases with standard patterns (skip research-phase):
- **Phase 2:** Standard CRUD-list-with-filters UI pattern, well-documented in Next.js/shadcn examples.
- **Phase 3:** Standard status-tracking CRUD, no novel integration.
- **Phase 4:** Dokploy's own Next.js and Cloudflare docs directly cover this deployment shape (confirmed via Context7 in STACK.md).

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified via Context7 official docs (Next.js, Drizzle, shadcn/ui) and live npm registry version checks |
| Features | MEDIUM | Cross-checked against multiple job-tracker products and the actual source repos, but no direct access to competitor usage data |
| Architecture | HIGH | Standard ETL/cache-then-serve pattern; reasoning-based rather than library-specific, assessed as high confidence for general software architecture |
| Pitfalls | HIGH/MEDIUM | GitHub API limits, markdown parsing, and Cloudflare/Traefik behavior are HIGH (well-documented official sources); licensing/ToS re-display risk is MEDIUM (GitHub's scraping policy is ambiguous and untested for this exact use case) |

**Overall confidence:** HIGH

### Gaps to Address

- **Deadline/urgency data quality:** FEATURES.md and PITFALLS.md both flag that `Summer2027-Internships` may not reliably expose parseable deadline data — verify during Phase 1 parsing work before committing UI real estate to this feature; if unusable, drop it from the roadmap entirely rather than carrying it as permanent P3 debt.
- **License/attribution due diligence:** Not yet performed — check each of the 3 source repos' LICENSE files and add UI attribution as a one-time Phase 1 checklist item (low effort, MEDIUM-confidence risk area per PITFALLS.md Pitfall 4).
- **.edu.pe eligibility curation approach:** Deferred to v2+ by design; no research gap to resolve now, but flag for the roadmapper that this needs a manual curation process, not a parsing task, when it's eventually scheduled.

## Sources

### Primary (HIGH confidence)
- Context7 `/vercel/next.js` — standalone output, Docker self-hosting guidance
- Context7 `/drizzle-team/drizzle-orm-docs` — node-postgres setup, migrations
- Context7 `/shadcn-ui/ui` — Tailwind v4 CSS-first install, Next.js installation flow
- npm registry — verified current package versions as of 2026-09-07
- [GitHub REST API rate limits & best practices](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api)
- [docs.dokploy.com](https://docs.dokploy.com/docs/core/nextjs) — Next.js and Cloudflare deployment guides
- [SimplifyJobs/Summer2027-Internships](https://github.com/SimplifyJobs/Summer2027-Internships) — actual source repo referenced in PROJECT.md

### Secondary (MEDIUM confidence)
- [Huntr](https://huntr.co/product/job-tracker), [Teal vs Huntr comparison](https://cloudcolleague.com/blogs/job-hunting/teal-vs-huntr/) — competitor feature patterns
- [Prentus job tracker comparison](https://prentus.com/blog/we-found-the-5-best-job-tracker-tools-on-the-market) — third-party review, cross-checked

### Tertiary (LOW confidence)
- [github/site-policy scraping issue #56](https://github.com/github/site-policy/issues/56) — ambiguous, needs manual per-repo license verification, not a definitive answer

---
*Research completed: 2026-09-07*
*Ready for roadmap: yes*
