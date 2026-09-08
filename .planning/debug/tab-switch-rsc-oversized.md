---
status: fixing
trigger: "Production bug: after first real data sync populated the dashboard, clicking a tab (Internships / Underclassmen / Beneficios) to switch no longer works. Server Reference ID / destination stream closed early errors in container logs."
created: 2026-09-08T15:20:00Z
updated: 2026-09-08T15:55:00Z
audit_acknowledged:
  milestone: v1.0
  at: 2026-09-08
  status: fixing
---

## Current Focus

hypothesis: page.tsx fetches full unfiltered row sets for ALL THREE tabs on every request (all TabsContent panels always mounted with full `rows` prop), ballooning the RSC navigation payload once real production-length text replaced short test fixtures — confirmed via direct curl+Playwright repro (17.4MB / 14.2s response, client ERR_ABORTED).
test: fix applied (only fetch active tab's full rows, lightweight COUNT() for the other two) — build + typecheck pass locally. Awaiting Dokploy token from Juan to redeploy and re-verify against production.
expecting: post-deploy, RSC tab-switch fetch should be well under 1MB and sub-second, no ERR_ABORTED, no more "destination stream closed early" in fresh container logs.
next_action: once Dokploy token received, trigger redeploy, then re-run curl RSC repro + Playwright click repro against https://opportunities.juan-tech.com and tail fresh container logs to confirm no recurrence.

## Symptoms

expected: clicking a tab (Internships / Underclassmen / Beneficios) switches the visible table content via a fast client-side RSC navigation.
actual: tab click does not switch content (or takes ~14s+ and may fall back to a full hard page reload); container logs show repeated errors during the window of real user interaction.
errors: |
  Error: The Server Reference ID did not match the expected format. Received "32442884".
  Error: The Server Reference ID did not match the expected format. Received "24d459a5".
  Error: The Server Reference ID did not match the expected format. Received "y".
  Error: The destination stream closed early.
started: immediately after the first real production data sync populated the dashboard (~16k+ real rows, full production-length text) — same row-count ballpark existed in test data before, but with much shorter strings.
reproduction: |
  curl -s -L -H "rsc: 1" -H "next-router-state-tree: ..." -H "next-url: /" "https://opportunities.juan-tech.com/?tab=underclassmen"
  -> 200, 17,404,403 bytes, 14.2s total.
  Playwright headless Chrome click on Underclassmen tab -> RSC fetch net::ERR_ABORTED (observed twice) before an eventual full-page fallback navigation.

## Eliminated

- hypothesis: Cloudflare/Traefik header-mangling of Next-Action/RSC/Next-Router-State-Tree headers under Full-strict proxied mode.
  evidence: reproduced the failure with a plain curl/Playwright request using the browser's real headers; the app itself returns a correctly-formed but massively oversized (17.4MB) response — no header corruption observed, no malformed request reached the origin from a real navigation. The "Server Reference ID" garbage-value errors are a distinct, request-decoding class of error (per Next.js's own docs: caused by build-version mismatch or automated security-scanning traffic sending malformed Next-Action headers) unrelated to a plain GET-style RSC tab navigation, which doesn't invoke a Server Action at all.
  timestamp: 2026-09-08T15:45:00Z
- hypothesis: stale-client-vs-new-server action-ID mismatch from multiple builds.
  evidence: ruled out by team lead before investigation started — single container running since first deploy, no redeploys.
  timestamp: 2026-09-08T15:20:00Z

## Evidence

- timestamp: 2026-09-08T15:22:00Z
  checked: src/components/dashboard/dashboard-tabs.tsx
  found: tab switch uses `router.replace()` — a client-side RSC GET-style navigation, not a Server Action POST. Confirms team lead's read of the code.
  implication: the "Server Reference ID" errors (which occur when decoding a Server Action reference from an incoming request) cannot originate from this navigation itself.
- timestamp: 2026-09-08T15:30:00Z
  checked: src/app/page.tsx (Home Server Component)
  found: fetches `listOpportunities("summer2027-internships", ...)`, `listOpportunities("underclassmen-opportunities", ...)`, and `listBenefits(...)` unconditionally on every request — filters only applied for the ACTIVE tab, but the other two tabs are still fetched with `{}` (i.e., full unfiltered dataset), and all three `<TabsContent>` panels are rendered into the tree every time with the full `rows` array passed to `VirtualizedOpportunitiesTable`/`BenefitsTable` regardless of which tab is active.
  implication: every navigation (including a plain tab switch) must serialize ALL THREE tabs' full datasets into the RSC flight payload — vastly oversized for what the user is actually looking at.
- timestamp: 2026-09-08T15:40:00Z
  checked: direct curl against https://opportunities.juan-tech.com/?tab=underclassmen with real RSC headers (rsc:1, next-router-state-tree, next-url) captured from a live Playwright browser session
  found: 200 OK, 17,404,403 bytes, 14.24s total time.
  implication: confirms the RSC navigation payload is enormous and slow — consistent with client-side abort/timeout behavior.
- timestamp: 2026-09-08T15:42:00Z
  checked: Playwright headless Chrome click on the Underclassmen tab against production
  found: the resulting RSC fetch request (`?tab=underclassmen&_rsc=...`) failed with `net::ERR_ABORTED` (observed on two separate attempts of the identical request), and the client eventually issued a full hard-navigation (`FRAMENAVIGATED` to the real document URL) as a fallback, well after the RSC fetch had already failed.
  implication: reproduces the user-visible "tab switching doesn't work" symptom end-to-end in a real browser; the abort is client-side, matching the server-side "destination stream closed early" log line (which fires when the server's write to the response stream fails because the client closed the connection).

## Resolution

root_cause: src/app/page.tsx always fetched and rendered the FULL, unfiltered dataset for all three tabs (internships, underclassmen, benefits) on every request/navigation, instead of scoping the fetch to only the currently-active tab. This made every RSC navigation payload — including a simple tab switch — include all three tabs' complete data. Row counts (~16k+ across sources) were similar before and after the first real sync, but real production title/company/location/description text is far longer than the short test fixtures used previously, pushing the serialized payload from a tolerable size to 17.4MB / 14.2s, which the browser (and/or Cloudflare in front of it) aborts mid-stream.

fix: |

  - src/app/page.tsx: only call `listOpportunities`/`listBenefits` with full results for the currently active tab; the other two tabs resolve to `[]` instead of a full unfiltered fetch.
  - src/db/queries/opportunities.ts: added `countActiveOpportunities(source)` — a cheap `COUNT(*) WHERE source = ? AND is_active = true` query.
  - src/db/queries/benefits.ts: added `countActiveBenefits()` — same pattern for the benefits table.
  - page.tsx tab badges now use the real filtered row count for the active tab, and the new lightweight COUNT query for the two inactive tabs (preserving the existing "isActive rows only" badge semantics without needing their full row data).

verification: |
  Local: `npx tsc --noEmit` clean, `npm run build` succeeds.
  Production: NOT YET VERIFIED — awaiting Dokploy API token from Juan to redeploy. Plan: redeploy, then re-run the curl RSC repro (expect response well under 1MB, well under 1s) and the Playwright click repro (expect no ERR_ABORTED, aria-selected flips to true promptly), and tail fresh container logs to confirm "destination stream closed early" does not recur.

files_changed:

  - src/app/page.tsx
  - src/db/queries/opportunities.ts
  - src/db/queries/benefits.ts
