# Feature Research

**Domain:** Personal internship/benefits aggregation dashboard + application tracker
**Researched:** 2026-09-07
**Confidence:** MEDIUM (patterns cross-checked against multiple job-tracker products and the actual source repos named in PROJECT.md; no direct access to competitor internal usage data)

## Feature Landscape

### Table Stakes (Users Expect These)

Features a single-user dashboard needs or it doesn't beat "just reading the GitHub READMEs manually."

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Live-refreshed listing table (roles, programs, benefits) | Core value prop is "always current, no manual repo-checking" — PROJECT.md explicitly rejects a static copy | MEDIUM | Requires scheduled fetch/parse of markdown tables (Summer2027-Internships, underclassmen-opportunities) and JSON (student-benefits) plus a cache layer so the UI doesn't hit GitHub on every page load |
| Search/filter by category, type, status (open/closed) | Named directly as an Active requirement in PROJECT.md; also standard on Simplify's own internship browser (filter by role, location, tech stack) | LOW–MEDIUM | Filter chips over parsed fields: role category, location, sponsorship, .edu campus requirement, open/closed |
| "Closed" / "no longer accepting" indicator | Summer2027-Internships marks rows as closed (🔒 emoji in source table) — surfacing this prevents Juan wasting time on dead links | LOW | Straight passthrough from source data, just needs UI treatment (strikethrough/badge) |
| Direct apply/source link per row | Table stakes for literally any listing tool — no value in a dashboard that doesn't link out to the actual application | LOW | Preserve original URL from parsed row |
| Personal application status tracking (applied / in process / rejected / accepted) | Explicit Active requirement; matches the core status field in Huntr/Teal/Simplify trackers | MEDIUM | Needs a persistence layer distinct from the live-fetched listings (see dependency below) |
| Notes field per tracked application | Standard on every competitor tracker (Huntr, Teal) for storing recruiter names, follow-up dates, interview notes | LOW | Free-text field attached to the tracked-application record |
| Cross-device sync (backend-persisted, not localStorage) | Explicit Active requirement — Juan checks from phone and laptop | MEDIUM | Needs a lightweight DB (Postgres, already available on Juan's Dokploy hosting) + minimal auth-free-but-not-public access model since it's single-user |
| Distinguish source/category (internship vs underclassmen program vs .edu benefit) | Three structurally different sources are being merged into one view; without a clear category split it becomes a confusing junk drawer | LOW–MEDIUM | Tabs or a top-level filter, not a fully merged table — the three sources have different schemas |
| Freshness indicator ("last synced X ago") | Standard trust signal for any tool claiming "live" data, especially since GitHub API rate limits mean fetch isn't literally real-time | LOW | Store last-fetch timestamp per source, show in UI |

### Differentiators (Competitive Advantage)

Not required, but where this personal tool can meaningfully beat "browsing the raw README on GitHub."

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Relevance scoring/highlighting for Juan's profile (SWE, advanced cycle, .edu.pe) | Underclassmen-opportunities is explicitly less relevant per PROJECT.md — auto-deprioritizing (not hiding) freshman/sophomore-only rows saves scanning time | MEDIUM | Simple rule-based tagging (parse "eligibility" column for class-year restrictions) beats full ML; keep it deterministic and explainable |
| .edu.pe eligibility flag for benefits | PROJECT.md flags this as an open question — surfacing which benefits plausibly accept non-`.edu` domains (vs. US-only) turns ambiguous data into a decision-ready view | MEDIUM | Requires a manual/curated overlay on top of the benefits.json `campusRequired` field since the source data won't natively answer this |
| Unified "new since last visit" view | Distinguishes real signal (newly posted roles) from noise across 1200+ rows updated daily — a common pain point competitors like Simplify solve with "posted X ago" sorting | MEDIUM | Diff against previous fetch snapshot, tag rows as new |
| Deadline/urgency surfacing | Table stakes for competitor trackers (Teal, Huntr show "what's due") but source data (Summer2027-Internships) usually lacks explicit deadlines — differentiator only if usable dates exist | MEDIUM–HIGH | Feasibility depends on source data quality; may not be reliably extractable |
| Personal saved/starred shortlist separate from applied | Lets Juan bookmark "interested" roles before committing to "applied," matching the funnel stage that Huntr/Teal build a whole Kanban board around | LOW–MEDIUM | Extra status value in the tracking schema, no new infra |
| One dashboard combining discovery + tracking in a single page | PROJECT.md's actual core value statement — most competitor tools (Simplify, Huntr) separate "browse jobs" from "my tracker" as different products/tabs; merging both for a personal tool removes app-switching | MEDIUM | This is the product's central differentiator, not an add-on — should shape the roadmap's first phase |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| Multi-user auth / accounts for others | Feels "complete" like a real SaaS product | Explicitly out of scope in PROJECT.md; adds auth infra, permission models, and security surface for zero benefit to a single user | Simple shared-secret or no-auth-behind-private-subdomain access, since it's Juan's own hosting |
| Auto-apply / autofill to application portals (like Simplify's extension) | Simplify itself offers this and it's tempting to copy | Explicitly out of scope in PROJECT.md — high risk (breaks on portal changes, could submit bad data), not requested | Keep manual "apply" via direct link; tracker only records status Juan enters himself |
| Push/email/Telegram alerts in v1 | Natural extension once new-listing detection exists | Explicitly deferred to v2 in PROJECT.md — adds notification infra, delivery reliability, and unsubscribe/quiet-hours complexity before the core dashboard is validated | Ship the "new since last visit" badge in-app first; revisit alerts only if the dashboard proves useful |
| Resume/cover-letter builder or ATS keyword matching (like Teal) | Common feature in every competitor product, feels like a natural companion | Completely orthogonal to the stated core value (aggregation + tracking); massive scope increase for a personal tool with no such requirement | Out of scope entirely — not even a v2 candidate unless requirements change |
| Full CRM / contact management (recruiter names, networking graph) | Huntr/Teal both build significant CRM layers | Adds a whole new data model and UI surface for a feature Juan didn't ask for; notes field already covers "remember details about an application" | Cover with the notes field on each tracked application instead of a dedicated contacts module |
| Curating/maintaining additional source repos beyond the 3 given | Feels like "more data = better dashboard" | Explicitly called out in PROJECT.md as research-only, not ongoing maintenance — turns a personal tool into an unbounded content-curation job | Treat additional sources (GitHub Global Campus, other awesome-lists) as a documented research backlog item, not a v1/v2 feature |

## Feature Dependencies

```
Live-refreshed listing table
    └──requires──> Source parsers (markdown-table parser for 2 repos, JSON parser for 1 repo)
                       └──requires──> Scheduled fetch + cache layer (respects GitHub rate limits)

Personal application status tracking
    └──requires──> Backend/DB persistence layer (Postgres via Dokploy)
                       └──enables──> Cross-device sync

"New since last visit" view
    └──requires──> Fetch snapshot history (must store previous fetch results, not just latest)
                       └──enhances──> Live-refreshed listing table

Relevance scoring for Juan's profile
    └──requires──> Parsed eligibility/class-year field from underclassmen-opportunities
                       └──enhances──> Search/filter by category

.edu.pe eligibility flag
    └──requires──> Curated overlay data (not present in source benefits.json)
                       └──enhances──> Benefits catalog view

Deadline/urgency surfacing ──conflicts──> Source data reliability
    (feature only works if Summer2027-Internships rows reliably include parseable deadline info — verify during Phase 1 before committing UI real estate to it)
```

### Dependency Notes

- **Live-refreshed listing table requires source parsers:** the three sources have three different formats (2 markdown tables with different column schemas, 1 JSON catalog) — this isn't one parser, it's three, and they should ship independently so one source going stale doesn't block the others.
- **Personal application status tracking requires a DB, which enables cross-device sync:** these two Active requirements are really one piece of infrastructure — build the persistence layer once, get both requirements satisfied together.
- **"New since last visit" requires snapshot history:** if the initial fetch design only stores "current state" and overwrites on each refresh, this differentiator becomes a rebuild later. Worth deciding storage design in Phase 1 even if the "new" badge itself ships later.
- **Deadline surfacing conflicts with source data reliability:** don't commit to this differentiator until Phase 1 confirms the source tables actually contain usable deadline data — GitHub-community-maintained tables like Summer2027-Internships are not guaranteed to have this field populated or in a consistent format.

## MVP Definition

### Launch With (v1)

- [ ] Live-refreshed listing table for all 3 sources (internships, underclassmen programs, .edu benefits) — this is the entire premise of the tool
- [ ] Search/filter by category, type, open/closed status — without this, 1200+ rows is unusable
- [ ] Closed/inactive indicator per listing — prevents wasted clicks
- [ ] Personal application status tracking with notes — the second explicit core requirement in PROJECT.md
- [ ] Cross-device persistence (DB-backed, not localStorage) — required because Juan checks from multiple devices
- [ ] Freshness/last-synced indicator — builds trust that "live" actually means live

### Add After Validation (v1.x)

- [ ] Relevance highlighting/deprioritization for underclassmen-only rows — add once the raw filtered view proves useful and manual scanning of low-relevance rows becomes the friction point
- [ ] Saved/starred shortlist status — add once "applied vs. interested" distinction becomes a real daily need
- [ ] "New since last visit" badge — add once snapshot history exists and Juan wants to know what changed without re-scanning everything

### Future Consideration (v2+)

- [ ] .edu.pe eligibility overlay for benefits — defer because it requires manual curation research per benefit, not a parsing task; evaluate after v1 shows which benefits Juan actually cares about
- [ ] Push/email/Telegram alerts — explicitly deferred in PROJECT.md pending v1 demonstrating value
- [ ] Deadline/urgency surfacing — defer pending a Phase 1 data-quality check on whether source tables reliably expose deadlines

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Live-refreshed listing table (3 sources) | HIGH | HIGH | P1 |
| Search/filter by category/type/status | HIGH | LOW | P1 |
| Application status tracking + notes | HIGH | MEDIUM | P1 |
| Cross-device DB persistence | HIGH | MEDIUM | P1 |
| Closed/inactive indicator | MEDIUM | LOW | P1 |
| Freshness indicator | MEDIUM | LOW | P1 |
| Relevance scoring for underclassmen rows | MEDIUM | MEDIUM | P2 |
| Saved/starred shortlist | MEDIUM | LOW | P2 |
| "New since last visit" view | MEDIUM | MEDIUM | P2 |
| .edu.pe eligibility overlay | MEDIUM | HIGH | P3 |
| Deadline/urgency surfacing | LOW–MEDIUM (uncertain data quality) | MEDIUM–HIGH | P3 |
| Push/email/Telegram alerts | LOW (unvalidated need) | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Huntr/Teal (general job trackers) | Simplify's own internship browser | Our Approach |
|---------|-----------------------------------|-----------------------------------|--------------|
| Listing discovery | Not their focus — assume you find jobs elsewhere and paste them in | Native: filters by role, location, tech stack, sponsorship; browses 12,000+ postings, refreshed hourly, community-updated | Match this closely but scoped to Juan's 3 named sources instead of a general crawler — parse the same community-maintained tables Simplify's own dataset draws from |
| Application tracking | Kanban board (Huntr) or stage-based list (Teal) with full CRM (contacts, documents) | Personal dashboard shows status per application, deadlines, next steps | Adopt the simple status-field + notes model; skip full CRM (see Anti-Features) |
| Autofill/auto-apply | Simplify's Chrome extension autofills 100+ ATS portals | N/A (this is the same product) | Explicitly excluded — PROJECT.md rules this out as high-risk and unrequested |
| Alerts | Both send email/push notifications on new matches | Simplify surfaces new roles via its own feed | Deferred to v2 per PROJECT.md; v1 relies on the in-app freshness/new-since-last-visit signal instead |
| Benefits/perks catalog | None of these tools cover student .edu benefits — this is a gap the underclassmen-opportunities/student-benefits sources fill that no mainstream tracker addresses | N/A | This is the dashboard's unique surface area — no direct competitor reference exists, so design should follow the source JSON schema (`title, description, tags, campusRequired`) rather than copy a job-tracker pattern |

## Sources

- [Huntr — Job Application Tracker & CRM](https://huntr.co/product/job-tracker) — HIGH confidence (official product page)
- [Best Free Job Tracker Apps 2026 comparison — Prentus](https://prentus.com/blog/we-found-the-5-best-job-tracker-tools-on-the-market) — MEDIUM confidence (third-party review, cross-checked against multiple similar comparison articles for consistency)
- [Teal vs Huntr comparison — cloudcolleague.com](https://cloudcolleague.com/blogs/job-hunting/teal-vs-huntr/) — MEDIUM confidence (third-party review)
- [SimplifyJobs/Summer2027-Internships — GitHub repo](https://github.com/SimplifyJobs/Summer2027-Internships) — HIGH confidence (the actual source repo named in PROJECT.md)
- [Simplify Jobs internship browser](https://simplify.jobs/internships) — HIGH confidence (official product, same data provider as the source repo)
- PROJECT.md — HIGH confidence (project's own stated requirements, out-of-scope list, and constraints)

---
*Feature research for: Personal internship/benefits aggregation + application tracking dashboard*
*Researched: 2026-09-07*
