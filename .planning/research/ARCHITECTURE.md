# Architecture Research

**Domain:** Personal single-user aggregation dashboard (external data ingestion + application tracking)
**Researched:** 2026-09-07
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Ingestion Layer                         │
├─────────────────────────────────────────────────────────────┤
│  ┌───────────┐  ┌───────────┐  ┌───────────┐                │
│  │ MD Table   │  │ MD Table   │  │ JSON File  │                │
│  │ Parser     │  │ Parser     │  │ Parser     │                │
│  │(Summer2027)│  │(underclass)│  │ (benefits) │                │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘                │
│        └──────────────┴──────────────┘                       │
│                       │  normalize → common schema            │
│                       ▼                                       │
│              ┌──────────────────┐                             │
│              │  Refresh Job      │  (cron / on-demand trigger) │
│              └────────┬──────────┘                             │
├───────────────────────┼───────────────────────────────────────┤
│                        ▼            API / App Layer            │
│              ┌──────────────────┐                              │
│              │  Backend (API +   │  filter/search endpoints,   │
│              │  server routes)   │  application CRUD           │
│              └────────┬──────────┘                              │
├───────────────────────┼───────────────────────────────────────┤
│                        ▼             Data Layer                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │ opportunities │  │  benefits     │  │ applications  │        │
│  │ (cache table) │  │ (cache table) │  │ (user data)   │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
│                     Postgres (single DB)                       │
├─────────────────────────────────────────────────────────────┤
│                          UI Layer                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Filterable/searchable list + application tracker UI  │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Source Parsers (x3) | Fetch raw content (GitHub raw README/JSON), parse into normalized shape, tolerate source schema drift | One parser module per source; markdown table parser (regex/AST) for the two MD sources, plain `JSON.parse` for benefits.json |
| Refresh/Sync Job | Orchestrate parsers, upsert into cache tables, record `last_synced_at` per source, handle partial failures | Scheduled function (cron inside the app container, e.g. `node-cron`) + a manual "refresh now" endpoint for on-demand trigger |
| Cache Store (opportunities/benefits) | Durable, queryable snapshot of external data — the UI never talks to GitHub directly | Postgres tables, one row per opportunity/benefit, with a stable `external_id` (dedupe key) and `source` column |
| Application Store | User's own tracking data (status, notes, dates) — never overwritten by refresh | Postgres table `applications`, foreign-keyed to `external_id` of an opportunity (not to the cache row, so it survives cache row churn) |
| API Layer | Serve filtered/searched data to UI, expose refresh trigger, CRUD for applications | Single backend process exposing REST/RPC endpoints; same runtime as the ingestion job (no separate microservice needed at this scale) |
| UI | Render list, filters, search, per-row application status control | Server-rendered or SPA frontend calling the API layer |

## Recommended Project Structure

```
src/
├── ingestion/                # Everything that talks to GitHub, never touched by UI code
│   ├── sources/
│   │   ├── summer-internships.ts   # parser for SimplifyJobs/Summer2027-Internships README table
│   │   ├── underclassmen.ts        # parser for underclassmen-opportunities table
│   │   └── student-benefits.ts     # parser for benefits.json
│   ├── normalize.ts          # maps each source's raw shape -> common Opportunity/Benefit schema
│   └── sync.ts                # orchestrates fetch -> parse -> normalize -> upsert, callable by cron or API route
├── db/
│   ├── schema.ts              # opportunities, benefits, applications tables
│   ├── client.ts              # DB connection
│   └── queries/                # filter/search queries, application CRUD
├── api/
│   ├── opportunities.ts        # GET list with filters
│   ├── benefits.ts              # GET list with filters
│   ├── applications.ts          # CRUD for tracking
│   └── sync.ts                   # POST /sync (manual refresh trigger)
├── ui/
│   ├── components/              # filter bar, opportunity card, benefit card, status picker
│   └── pages/                    # dashboard, benefits view
└── jobs/
    └── scheduled-sync.ts         # cron entrypoint, calls ingestion/sync.ts on interval
```

### Structure Rationale

- **ingestion/ isolated from api/ and ui/:** source parsers are the most fragile part of the system (GitHub markdown tables change format without notice). Isolating them means a broken parser fails loudly in one place and never corrupts the API contract the UI depends on.
- **normalize.ts as a single seam:** every source parser outputs raw shape; one function maps all three into the same `Opportunity`/`Benefit` type. This is the point where "what does a role look like" is decided once, so filters/search in the UI never need to know which source a row came from.
- **db/queries/ separate from api/:** keeps SQL/filter logic testable independent of HTTP framework.
- **jobs/ as a thin wrapper:** the actual sync logic lives in ingestion/sync.ts so it can be triggered identically by cron or by a manual API call — no duplicated logic between "scheduled" and "on-demand" refresh.

## Architectural Patterns

### Pattern 1: Scheduled ETL into a cache table (not on-request fetch)

**What:** A background job periodically fetches and parses the three GitHub sources, normalizes them, and upserts into Postgres tables. The UI/API only ever reads from Postgres — it never fetches GitHub live per request.
**When to use:** Always, for this project. GitHub raw content fetches are slow (network + parsing a 1000+ row markdown table) and rate-limited; doing this per page load would make the dashboard feel sluggish and risks hitting GitHub's unauthenticated rate limit (60 req/hr) fast.
**Trade-offs:** Data is only as fresh as the last sync (mitigated by a short interval, e.g. every 1-4 hours, plus a manual "refresh now" button). In exchange, page loads are fast (simple DB query) and resilient to GitHub being temporarily down or a source repo restructuring its table mid-request.

**Example:**
```typescript
// jobs/scheduled-sync.ts
cron.schedule('0 */2 * * *', () => runSync()); // every 2 hours

// api/sync.ts — manual trigger, same function
export async function POST() { await runSync(); return { ok: true }; }
```

### Pattern 2: Stable external_id for dedupe and application linkage

**What:** Each parsed opportunity/benefit gets a deterministic `external_id` derived from stable fields (e.g. hash of company+role+source, or row position + source for benefits) rather than a DB auto-increment.
**When to use:** Always. The refresh job re-parses the entire source every run; without a stable ID, "upsert" degenerates into "delete everything, reinsert everything," which breaks the foreign key from `applications` to a given opportunity every time the cache refreshes.
**Trade-offs:** Slightly more parsing work to build a good hash key; sources with poor structure (e.g. a benefits list with only a title) may produce collisions if two entries are near-duplicates — acceptable risk at this data scale, worth a code comment where the hash is built.

**Example:**
```typescript
const external_id = sha1(`${source}:${company}:${role}:${location}`);
// applications.opportunity_external_id references this, never the DB row id
```

### Pattern 3: Soft-delete / mark-stale instead of hard delete on sync

**What:** When a sync runs, rows no longer present in the source are marked `is_active = false` rather than deleted, and rows still present get `last_seen_at` bumped.
**When to use:** Whenever a user might have an application tracked against a row that later disappears from the source (e.g. an internship posting gets removed once filled). Hard-deleting would either cascade-delete the user's tracked application or orphan it.
**Trade-offs:** Slightly larger table over time (negligible at this scale — low thousands of rows); UI must filter `is_active = true` by default but can offer "show closed/removed" as a filter, which is actually a feature the user asked for (open/closed status).

## Data Flow

### Refresh Flow (ingestion)

```
[Cron tick / manual "Refresh" button]
    ↓
[sync.ts] → fetch raw content from 3 GitHub URLs (raw.githubusercontent.com)
    ↓
[per-source parser] → extract rows from markdown table / JSON array
    ↓
[normalize.ts] → map to common Opportunity/Benefit schema, compute external_id
    ↓
[db upsert] → insert new rows, update existing (by external_id), mark missing rows is_active=false
    ↓
[sync_log table] → record timestamp, row counts, per-source success/failure
```

### Request Flow (UI)

```
[User opens dashboard / applies filter]
    ↓
[UI] → GET /api/opportunities?category=SWE&status=open
    ↓
[API layer] → query Postgres (indexed on category, status, is_active)
    ↓
[Response] → JSON list → render cards
```

### Application Tracking Flow

```
[User clicks "Applied" on a card]
    ↓
[UI] → PUT /api/applications/:external_id { status: "applied", notes }
    ↓
[API layer] → upsert into applications table (keyed by external_id, single user — no user_id needed)
    ↓
[Response] → updated row → UI reflects new status, persists across devices via DB (not localStorage)
```

### Key Data Flows

1. **Ingestion (write path):** GitHub raw content → parse → normalize → Postgres cache tables. Runs on a schedule (background) and on-demand (manual trigger from UI). This is the only path that ever talks to GitHub.
2. **Read/serve (request path):** UI → API → Postgres cache tables + applications table joined by `external_id`. Never touches GitHub. This is what makes page loads fast regardless of source size or GitHub availability.
3. **Tracking (write path, user-originated):** UI → API → applications table only. Fully decoupled from the refresh job — a sync running concurrently with a user updating a status cannot conflict, since sync never writes to `applications`.

## Scaling Considerations

This is a single-user personal tool; "scaling" here means "handling more data volume and more sources," not more users.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Current (3 sources, ~1-2k rows, 1 user) | Single container: cron + API + DB client in one process, one Postgres instance. No queue, no separate worker needed. |
| More sources added (5-10 sources) | Keep the same structure; each new source is one more file in `ingestion/sources/`. Consider moving sync to a separate lightweight worker process only if parsing time starts blocking API responsiveness (unlikely at this row count). |
| Much larger source tables (10k+ rows) or many more sources | Move sync job to run truly out-of-process (separate Dokploy service) so a slow/failing parse never risks the API container's health check; add per-source rate limiting/backoff for GitHub API calls if switching from raw content to the GitHub REST API. |

### Scaling Priorities

1. **First (and likely only) bottleneck:** GitHub rate limiting if the app ever switches from `raw.githubusercontent.com` (unauthenticated raw file fetch, generous limits) to the GitHub REST/GraphQL API for metadata — mitigate by using raw content fetches (no auth, no rate concern for 3 files every couple hours) rather than the API, and by using a GitHub token if the API is ever needed (5000 req/hr authenticated vs 60 unauthenticated).
2. **Second, low-priority:** Markdown table parsing fragility if a source repo changes its README table format — mitigate with a sync_log table that records parse failures explicitly (row count = 0 or parse exception) so Juan notices instead of silently serving stale data forever.

## Anti-Patterns

### Anti-Pattern 1: Fetching and parsing GitHub sources on every page load

**What people do:** Call GitHub directly from the API route handling the dashboard request, parse on the fly, return to UI.
**Why it's wrong:** Slow (parsing a 1000+ row table per request), fragile (any GitHub hiccup breaks the dashboard), and risks rate limits since every page view = 3 external fetches.
**Do this instead:** Always serve from the Postgres cache; only fetch GitHub during the scheduled/manual sync job (Pattern 1 above).

### Anti-Pattern 2: Storing application tracking state as a foreign key to an auto-increment cache row ID

**What people do:** `applications.opportunity_id` references `opportunities.id` (serial primary key).
**Why it's wrong:** Every sync re-upserts the cache; if the upsert strategy ever does delete+reinsert (even partially, e.g. during a schema migration), the serial ID changes and every tracked application silently loses its link to the opportunity it was tracking.
**Do this instead:** Reference the stable `external_id` (Pattern 2 above), which is derived from source content and is stable across syncs regardless of how the cache table itself is implemented.

### Anti-Pattern 3: localStorage as the source of truth for application tracking

**What people do:** Store applied/status data in the browser's localStorage since it's the fastest thing to build.
**Why it's wrong:** Explicitly violates the project's own requirement — Juan needs to see tracking state on both phone and laptop. localStorage is per-browser, per-device.
**Do this instead:** Persist directly to Postgres via the API from day one; there is no valid intermediate step here since the requirement is already known up front.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| `raw.githubusercontent.com` (Summer2027-Internships README) | Plain HTTPS GET of the raw markdown file, parsed as a markdown table | No auth needed; watch for README restructuring since it's the most actively edited file (daily community PRs) |
| `raw.githubusercontent.com` (underclassmen-opportunities README) | Same pattern, markdown table parse | Lower change frequency than Summer2027; still parse defensively (missing columns, extra columns) |
| `raw.githubusercontent.com` (student-benefits benefits.json) | Plain HTTPS GET + `JSON.parse`, structure already given: `{title, description, imageSrc, tags, campusRequired}` | Simplest source — no table parsing needed, just schema mapping |
| Dokploy (deploy target) | App ships as a single Docker container; Dokploy handles build/deploy from a Dockerfile or docker-compose | Postgres should be a Dokploy-provisioned native DB (per project constraints), not bundled in the app container, so data survives app redeploys |
| Cloudflare (DNS) | Subdomain of `juan-tech.com` pointed at the Dokploy-exposed port via Cloudflare DNS/proxy | No app-level integration work beyond normal env var for the public URL if needed for CORS/callback purposes |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| ingestion ↔ db | Direct function calls writing via the DB client (upsert) | No API layer between them — ingestion is trusted internal code, not user-facing |
| api ↔ db | Direct function calls (query builder / ORM) | Single process, no network hop; keep DB access behind `db/queries/` so API handlers stay thin |
| ui ↔ api | HTTP (REST/RPC) over same-origin routes | Standard fetch from frontend; no separate API domain needed given single-container deploy |
| jobs (cron) ↔ ingestion | Direct function call (`runSync()`) | Both scheduled and manual trigger call the exact same function — no logic duplication |

## Sources

- Project context: `/Users/juan/Documents/Codigo/Personal/opportunities/.planning/PROJECT.md`
- Patterns above reflect standard ETL/cache-then-serve architecture, widely used for GitHub-scraping dashboards and internal tools; assessed at HIGH confidence as general software architecture reasoning rather than library-specific claims requiring documentation lookup.

---
*Architecture research for: Personal opportunities/benefits aggregation dashboard*
*Researched: 2026-09-07*
