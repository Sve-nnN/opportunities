# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js 16 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui, Drizzle ORM + Postgres. Self-hosted on Dokploy/Hetzner via Docker (`output: 'standalone'`) — no Vercel-specific features. Decided during project setup, not delegated.

## Users

A single user: Juan, a Software Engineering student in advanced cycles at UPC (Lima, Perú), using his own institutional email. He checks the dashboard from both phone and laptop to scan internships, industry programs, and .edu student benefits, and to track the status of his own applications. No other users — this is a personal tool, not a multi-tenant product.

## Product Purpose

Aggregates internship listings, industry/networking programs, and .edu student benefits from three public GitHub-hosted sources into one always-current dashboard, and lets Juan track his own application status per opportunity. Success means Juan never has to manually re-check the three source repos, and can tell at a glance what's open, what he's already engaged with, and what benefit he isn't using yet.

## Positioning

Unlike general job trackers (Huntr, Teal) which assume you paste in your own leads, and unlike Simplify's own internship browser which only covers internships, this dashboard merges discovery (3 curated sources spanning internships, programs, and student benefits) and personal tracking into one page scoped to Juan's own profile — no other tool combines student-benefit discovery with application tracking.

## Operating Context

Data refreshes on a 2h server-side cron (never fetched live per page view) from Postgres, which is itself synced from three community-maintained GitHub sources: `SimplifyJobs/Summer2027-Internships` (JSON-backed listings), `Jose-Gael-Cruz-Lopez/underclassmen-opportunities` (markdown table, less relevant to Juan's advanced cycle but still surfaced), and `Mapaor/student-benefits` (JSON benefits catalog). Juan is past the "underclassmen" eligibility window himself.

## Capabilities and Constraints

- Read-heavy dashboard: browse ~3,000+ internships, ~100+ underclassmen programs, ~40 benefits, filtered/searched from Postgres.
- Application tracking (status + notes) is a separate write path the user controls directly — not derived from sync.
- Single-user, no auth/accounts needed; not designed to scale to other students.
- Data can be stale up to the sync interval (~2h) or flagged failed — the UI must never claim "live" without showing when it last actually synced.
- Underclassmen-only listings are surfaced, not hidden, even though less relevant to Juan's current cycle (no auto-filtering logic exists yet).

## Brand Commitments

None — personal tool, no public branding, logo, or palette commitments. Free to choose a clean, functional visual system.

## Evidence on Hand

Real live data exists in Postgres from Phase 1 (ingestion already built and verified): real internship postings, real program listings, real benefit entries — no placeholder/lorem-ipsum content should be used once data-bound screens are built.

## Product Principles

- Scanability over decoration — Juan needs to parse hundreds of rows fast; the interface is a tool, not a showcase.
- Never claim freshness without proof — every data view shows when it was actually last synced, and surfaces sync failures rather than silently going stale.
- One page for discovery + tracking — the product's core differentiator is not splitting "browse" and "my applications" into separate flows.
- Accessible by default, not as an afterthought — strict WCAG compliance is a hard project constraint (see Accessibility below), not optional polish.

## Accessibility & Inclusion

Hard project requirement (user's own global instruction, non-negotiable): follow A11Y.md (https://github.com/fecarrico/A11Y.md) strictly for all frontend work — full keyboard navigation, visible focus states, correct ARIA roles/semantic HTML for data tables, WCAG AA contrast minimum, never convey state (e.g. open/closed) through color alone.
