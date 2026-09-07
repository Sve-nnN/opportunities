# Pitfalls Research

**Domain:** Live-fetch dashboard aggregating community-maintained GitHub markdown tables + JSON, self-hosted on Dokploy/Cloudflare
**Researched:** 2026-09-07
**Confidence:** HIGH (GitHub API limits, markdown parsing, Cloudflare/Traefik behavior are well-documented with official sources) / MEDIUM (licensing/ToS re-display, since GitHub's scraping policy is ambiguous and untested for this exact use case)

## Critical Pitfalls

### Pitfall 1: Unauthenticated GitHub API calls hit the 60/hour wall almost immediately

**What goes wrong:**
A single-user dashboard that fetches `SimplifyJobs/Summer2027-Internships`, `underclassmen-opportunities`, and `student-benefits` "live" on every page load will burn through GitHub's **60 requests/hour unauthenticated limit** in minutes if it calls the REST API directly (not raw content). Even fetching via `raw.githubusercontent.com` counts against the same unauthenticated per-IP limit. If Dokploy's outbound IP is shared with other services or the VPS itself makes other GitHub calls (CI, deploy hooks), the limit is shared and exhausted faster than expected.

**Why it happens:**
Developers assume "public repo, no auth needed" and wire up naive fetch-on-request. They discover the ceiling only after the dashboard starts returning stale/empty data or 403s under normal daily use.

**How to avoid:**
- Always use a GitHub Personal Access Token (even unscoped/read-only) server-side → raises the limit to 5,000/hour.
- Never fetch directly on user page-load; fetch on a schedule (e.g., every 1-4 hours via cron/background job) into your own DB/cache, and serve the dashboard from that cache.
- Use conditional requests (ETags / `If-None-Match`) — a 304 with a valid Authorization header does not count against the primary rate limit.

**Warning signs:** 403 responses with `X-RateLimit-Remaining: 0`; dashboard showing empty/stale sections intermittently; works in dev (low traffic) but fails after deploy when combined with health checks or multiple environments hitting GitHub.

**Phase to address:** Ingestion/fetch-layer phase (must be designed before any live-fetch feature ships, not retrofitted).

---

### Pitfall 2: Markdown table parser breaks silently when upstream format drifts

**What goes wrong:**
`SimplifyJobs/Summer2027-Internships` and `underclassmen-opportunities` are community-edited markdown tables. Rows contain HTML (`<details>`, `<img>` badges for "closed"/"actively hiring", emoji shortcodes like `🔒` or `:closed_lock_with_key:`, multiple locations joined with `<br>`, and links formatted as `[Company](url)` inside cells). A parser built against today's format (e.g., naive regex splitting on `|`) breaks the moment: a column count changes, someone adds a new badge type, a cell contains an escaped pipe `\|`, or GitHub's own README-generation script (used by SimplifyJobs, per their CONTRIBUTING.md) changes column order between PRs.

**Why it happens:** The table is not a data contract — it's rendered for human eyes in GitHub's UI. Contributors and maintainers change formatting for readability, not for parser stability. There is no versioning or schema guarantee.

**How to avoid:**
- Prefer the underlying JSON when it exists: SimplifyJobs' actual data lives in `.github/scripts/listings.json` and the README table is *generated* from it — fetch that JSON directly instead of parsing the rendered markdown table (more stable, already structured with fields like `company_name`, `locations`, `title`, `date_posted`, `active`, `url`).
- For repos where only the markdown table exists (`underclassmen-opportunities`), use a battle-tested markdown-table parser (not hand-rolled regex), strip HTML tags defensively, and normalize badge/emoji values into an enum with a fallback "unknown" state rather than crashing.
- Add a parse-count sanity check (e.g., "expected column count is 5, got 7 → log warning + skip row, don't crash whole ingestion") so one malformed row doesn't take down the whole fetch job.

**Warning signs:** Row counts dropping to zero or spiking abnormally after an upstream commit; fields showing raw HTML tags or emoji shortcodes unrendered; ingestion job throwing exceptions tied to specific PRs in the source repo.

**Phase to address:** Ingestion/parsing phase — build against the JSON source first where available; treat markdown-table parsing as inherently best-effort with graceful degradation.

---

### Pitfall 3: "Live" data with no caching strategy conflates freshness with reliability

**What goes wrong:** Teams often solve Pitfall 1 by adding a token, then overcorrect by fetching on every request "since we have more headroom now." This still couples dashboard uptime to GitHub's availability and rate limits, and any transient GitHub outage or API change makes the whole dashboard blank instead of showing slightly-stale-but-usable data.

**Why it happens:** "Live data" in the requirements gets literally interpreted as "fetch on every view" instead of "fetch on a scheduled cadence and always serve from cache."

**How to avoid:** Decouple ingestion from serving. Run a scheduled job (hourly is more than sufficient — SimplifyJobs updates daily, student-benefits/underclassmen repos update far less often) that pulls, parses, and writes to the DB. The dashboard always reads from the DB, never from GitHub directly. Store `last_synced_at` per source and surface it in the UI so Juan knows how fresh the data is instead of assuming instantaneous freshness.

**Warning signs:** Dashboard load time correlates with GitHub API latency; dashboard goes blank when GitHub is slow/down; no visible "last updated" timestamp anywhere in the UI.

**Phase to address:** Ingestion/fetch-layer phase, same phase as Pitfall 1 (they're the same architectural decision: pull-and-cache vs. fetch-on-request).

---

### Pitfall 4: Re-displaying scraped GitHub content without checking license/attribution exposes the project to takedown risk

**What goes wrong:** GitHub's site policy is explicit that scraping public repo content is generally tolerated for personal/research use, but re-publishing/re-displaying that data as a competing or derivative product (even personal) without attribution can violate the source repo's license (if one exists) or GitHub ToS around excessive automated access. `SimplifyJobs/Summer2027-Internships`, `student-benefits`, and `underclassmen-opportunities` should each be checked individually — license file present or not, and whether their own README/CONTRIBUTING states usage terms for their data (SimplifyJobs explicitly builds tooling around their own JSON and may have opinions on third-party consumption).

**Why it happens:** Because the intended use here is personal/single-user (not a public product), this risk is genuinely low — but it's easy to later "share the dashboard with friends" or make it public, at which point the same code has a materially different risk profile without anyone re-checking licensing.

**How to avoid:** Check each source repo's LICENSE file up front (log findings in the project doc). Attribute the source visibly in the UI ("Data from SimplifyJobs/Summer2027-Internships, updated hourly") regardless of legal necessity — cheap insurance and useful context for Juan. Keep the "Out of Scope: multi-user product" constraint enforced technically (no public signup) so the risk profile doesn't silently change.

**Warning signs:** None until someone flags it — this is a "check once, document, move on" pitfall, not one with runtime symptoms.

**Phase to address:** Ingestion phase (as a one-time due-diligence checklist item, not ongoing work).

---

### Pitfall 5: Cloudflare proxy in front of self-hosted Dokploy origin breaks SSL or leaks origin IP if misconfigured

**What goes wrong:** Two common failure modes when adding a Cloudflare-proxied subdomain (`opportunities.juan-tech.com`) in front of a Dokploy/Traefik origin on Hetzner:
1. **SSL mode mismatch:** If Cloudflare SSL mode is set to "Flexible" while Traefik/Dokploy only serves HTTPS (or redirects HTTP→HTTPS), you get redirect loops. If set to "Full (strict)" without a valid certificate chain on the origin (Let's Encrypt via Traefik is fine; a self-signed cert is not), connections fail.
2. **Real-IP / firewall confusion:** Once proxied, the origin only sees Cloudflare's IP ranges, not real visitor IPs — any origin-level rate limiting or IP-based logic (including your own app's request logging) will show Cloudflare IPs unless `CF-Connecting-IP` header is explicitly read and Traefik is configured to trust Cloudflare's IP ranges as forwarded-for.

**Why it happens:** Cloudflare's proxy is opaque by default — the failure only surfaces when someone tries to lock down the origin (firewall rules) or debug why every request "comes from the same few IPs."

**How to avoid:** Use Cloudflare SSL mode "Full (strict)" with Let's Encrypt on the Traefik/Dokploy side (works out of the box, no need for Cloudflare Origin CA certs — avoid that path, it's fragile and breaks on Dokploy updates per known GitHub issues). Explicitly configure Traefik to trust Cloudflare's published IP ranges for `X-Forwarded-For`/`CF-Connecting-IP` if any IP-based logic is added later. Since this is single-user with no public signup, IP-based abuse protection is low priority — don't over-invest here.

**Warning signs:** Redirect loop on first HTTPS visit; Traefik logs show "bad certificate" or ACME challenge failures; app logs show all traffic coming from a small set of Cloudflare IP ranges instead of Juan's actual devices.

**Phase to address:** Deploy phase — verify SSL mode + working HTTPS access as an explicit deploy-phase acceptance check, not assumed to "just work" because Cloudflare + Dokploy are both configured elsewhere in `hosting/infra`.

---

### Pitfall 6: Secrets (GitHub PAT, DB credentials) stored as plaintext env vars in Dokploy with no rotation plan

**What goes wrong:** Dokploy stores environment variables in plaintext accessible to anyone with project-level dashboard access. For a single-user personal project this is lower risk than a team setting, but the GitHub PAT used for higher rate limits is still a credential that, if leaked (e.g., committed to a public repo by accident, or exposed via a misconfigured API endpoint that echoes env vars), grants read access tied to Juan's GitHub account.

**Why it happens:** Personal projects skip secret-management rigor because "it's just me." The PAT gets pasted into Dokploy once and forgotten, with no expiration set on the GitHub side.

**How to avoid:** Create the GitHub PAT with **read-only, fine-grained scope** limited to public repo metadata (no write, no other-repo access) and set an expiration (e.g., 1 year) so an old leaked token has a shelf life. Never log full env var values in application logs. Keep `.env`/secrets out of the git repo (standard `.gitignore`, verify before first commit).

**Warning signs:** N/A proactively — this is a hygiene check to do once at setup, not something with runtime symptoms until an incident occurs.

**Phase to address:** Deploy/setup phase, done once alongside initial Dokploy environment configuration.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|--------------------|-----------------|------------------|
| Regex-based markdown table parsing instead of a proper parser library | Faster to write initially | Breaks silently on any upstream format drift (Pitfall 2) | Never for `underclassmen-opportunities`; acceptable only as a throwaway prototype before switching to JSON source for SimplifyJobs |
| Fetching GitHub content on every dashboard page load instead of scheduled cache | Simpler code, no cron/job infra needed | Rate-limit exhaustion, coupling dashboard uptime to GitHub uptime (Pitfalls 1 & 3) | Never beyond initial local dev/testing |
| No `last_synced_at` timestamp in UI | One less field to build | Juan can't tell if data is fresh or hours/days stale, undermining the core value prop | Never — trivial to add, high value |
| Skipping license/attribution check on source repos | Saves 15 minutes | Risk of takedown/ToS issue if dashboard is ever shared beyond Juan | Acceptable short-term only if documented as a TODO before any sharing/publicity |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|------------------|--------------------|
| GitHub REST/raw content API | Fetching unauthenticated, on-demand per page view | Authenticate with fine-scoped PAT; fetch on schedule into cache/DB, not per-request |
| SimplifyJobs repo | Parsing the rendered README markdown table | Fetch `.github/scripts/listings.json` directly — it's the actual data source, README is generated from it |
| Cloudflare + Dokploy/Traefik | Using Cloudflare Origin CA certs for "Full (strict)" mode | Use Let's Encrypt via Traefik (Dokploy default) — Cloudflare trusts it in Full (strict) with no extra cert management |
| Dokploy env vars | Treating them as securely encrypted secrets | Treat as plaintext-visible to anyone with dashboard access; scope tokens minimally and set expirations |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Fetching all 3 sources synchronously on every scheduled sync without concurrency limits | Sync job takes long, occasionally times out | Run fetches in parallel with per-source error isolation (one source failing shouldn't block others) | Irrelevant at 3 sources/1 user scale — low priority, but easy to get right from the start |
| Storing entire raw markdown/JSON blob in DB and re-parsing on every dashboard read | Slower page loads as data grows | Parse once at ingestion time, store normalized rows; dashboard reads structured data only | Noticeable once internship list exceeds a few hundred rows, which SimplifyJobs already has (~1200+) |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Overscoped GitHub PAT (e.g., full repo access) used just to raise rate limits | Leaked token grants far more access than needed | Use fine-grained PAT scoped to public metadata read only, with expiration |
| Exposing an internal `/sync` or `/debug` endpoint without auth on the self-hosted app | Anyone who finds the subdomain could trigger syncs or read internal state | Even for single-user apps, put a simple shared-secret/basic-auth check on any non-public route |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| No visible "data last updated" indicator | Juan can't trust whether he's seeing this morning's or last week's roles | Show `last_synced_at` per source prominently near the relevant section |
| Treating parse failures as silent data loss (row just disappears) | Juan might miss a real internship because a badge format tripped the parser | Log/surface parse failures somewhere visible (even just a small "N rows skipped" note) so gaps are noticed, not assumed complete |

## "Looks Done But Isn't" Checklist

- [ ] **Live fetch:** Often missing scheduled caching — verify dashboard reads from DB/cache, not directly from GitHub on each request
- [ ] **Markdown parsing:** Often missing handling for HTML-in-cells and column drift — verify with a deliberately malformed row that ingestion degrades gracefully instead of crashing
- [ ] **Rate limit handling:** Often missing authenticated requests — verify the PAT is actually being sent (check response headers for `X-RateLimit-Limit: 5000`, not `60`)
- [ ] **HTTPS via Cloudflare:** Often "works" in browser but breaks under Full (strict) mode inconsistency — verify SSL mode matches origin cert setup end-to-end, not just "site loads"
- [ ] **Secrets:** Often missing scope/expiration on tokens — verify the GitHub PAT is fine-grained, read-only, and has an expiration date set

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|-----------------|-------------------|
| Rate limit exhaustion in production | LOW | Add PAT auth, switch to scheduled sync — no data loss, just delayed freshness until next successful sync |
| Parser breaks on upstream format change | LOW–MEDIUM | Patch parser for new format, backfill by re-running sync job against current source state (no historical data lost since source of truth is upstream, not your DB) |
| Cloudflare/SSL misconfiguration post-launch | LOW | Adjust SSL mode setting in Cloudflare dashboard, no code deploy needed — takes effect within minutes |
| Leaked GitHub PAT | MEDIUM | Revoke token immediately in GitHub settings, issue new fine-scoped token, update Dokploy env var, redeploy |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|--------------------|----------------|
| Unauthenticated rate-limit exhaustion | Ingestion/fetch-layer phase | Response headers show 5000/hour limit; sync job runs reliably over 24h without 403s |
| Markdown parser fragility | Ingestion/parsing phase | Parser handles a deliberately malformed test row without crashing; SimplifyJobs source uses JSON not README scraping |
| No caching / fetch-on-request | Ingestion/fetch-layer phase | Dashboard load time independent of GitHub API latency; "last synced" timestamp visible |
| License/ToS re-display risk | Ingestion phase (due diligence) | Each source's license documented in project notes; attribution shown in UI |
| Cloudflare/SSL misconfiguration | Deploy phase | HTTPS loads without redirect loop; Cloudflare SSL mode matches origin cert (Full strict + Let's Encrypt) |
| Plaintext secrets / overscoped PAT | Deploy/setup phase | PAT scope reviewed as read-only + expiring; no secrets committed to git |

## Sources

- [Rate limits for the REST API - GitHub Docs](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api?apiVersion=2026-03-10)
- [Updated rate limits for unauthenticated requests - GitHub Changelog](https://github.blog/changelog/2025-05-08-updated-rate-limits-for-unauthenticated-requests/)
- [GitHub API Rate Limits: an Unauthenticated 304 Still Costs You a Request - DEV Community](https://dev.to/0012303/github-api-rate-limits-an-unauthenticated-304-still-costs-you-a-request-3af7)
- [GitHub - SimplifyJobs/Summer2027-Internships](https://github.com/SimplifyJobs/Summer2027-Internships)
- [Summer2026-Internships/CONTRIBUTING.md at dev · SimplifyJobs](https://github.com/SimplifyJobs/Summer2026-Internships/blob/dev/CONTRIBUTING.md)
- [Scraping policy · Issue #56 · github/site-policy](https://github.com/github/site-policy/issues/56)
- [Environment Variables | Dokploy](https://docs.dokploy.com/docs/core/variables)
- [Cloudflare | Dokploy](https://docs.dokploy.com/docs/core/domains/cloudflare)
- [Support for Cloudflare Origin CA certificates in Dokploy · Issue #1839](https://github.com/Dokploy/dokploy/issues/1839)
- [How to Manage Environment Variables in Dokploy (2026 Guide) - EnvManager](https://envmanager.com/blog/dokploy-environment-variables-guide)
- [Markdown Tables — Syntax, GitHub Examples & Colspan Guide](https://getmd.ma/guides/markdown-table)

---
*Pitfalls research for: Live-fetch personal opportunities dashboard (GitHub markdown/JSON sources, Dokploy + Cloudflare self-hosted deploy)*
*Researched: 2026-09-07*
