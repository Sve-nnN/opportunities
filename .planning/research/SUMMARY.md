# Project Research Summary

**Project:** Opportunities Hub — v1.1 "Auto-apply asistido con IA"
**Domain:** AI-agent-assisted, human-reviewed browser automation (auto-fill job application forms) added to an existing single-user Next.js/Drizzle/Postgres dashboard
**Researched:** 2026-09-08
**Confidence:** MEDIUM-HIGH

## Executive Summary

v1.1 adds a "Send to AI" workflow to the existing dashboard: Juan clicks a button on an opportunity, the app generates a self-contained prompt (opportunity URL + a growing key-value profile snapshot + fixed instructions), he pastes it into an external Claude Code session, and that session drives a real browser to fill the ATS application form, shows him the result, and — only after his explicit OK — submits it. The session then calls back a secret-gated API route in this app to record status, update the reusable profile, and log exactly what was sent to that specific site. This is not a new product category with established prior art; it's a synthesis of three separate patterns (commercial autofill extensions, "copy prompt to external coding agent" dev-tool buttons, and AI-agent audit-trail guidance), so implementation details are inferred-and-adapted rather than copied from a single reference.

**Important correction to the original plan:** Juan's brief specified "use Scrapling" for the browser automation. Research found Scrapling is an adaptive *scraping/extraction* library, not an interactive form-filling tool — its documented "form submission" is a raw HTTP POST with a hardcoded field dictionary, which does not work against JS-rendered SPA application forms (Workday, most Greenhouse/Lever embeds). Scrapling's browser fetchers only support custom interaction by handing you a raw Playwright `Page` object via a `page_action` callback — at that point it's just Playwright with an extra dependency. The correct tool is **Playwright MCP** (`@playwright/mcp`, Microsoft's official MCP server), registered once in the external Claude Code session (`claude mcp add playwright npx @playwright/mcp@latest`). It exposes exactly the needed workflow as native tools: `browser_navigate`, `browser_snapshot` (accessibility-tree field discovery), `browser_fill_form`, `browser_take_screenshot` (for Juan's review), `browser_click` (submit, only after explicit OK). Scrapling survives only as a narrow, documented fallback for the rare case a specific ATS blocks the Playwright MCP browser with bot detection (e.g. Cloudflare) — `StealthySession(solve_cloudflare=True)` to get past the challenge, then hand off. This correction changes the "Send to AI" prompt template and the roadmap phase that builds it, but changes nothing in the app's own `package.json` — neither tool is a dependency of the Next.js app; both run entirely inside the external Claude Code session.

The recommended approach extends the existing stack with zero new runtime dependencies in the Next.js app: two new Drizzle tables (`profile_fields` key-value store, `application_history`/`applicationSendLog` per-application audit log), a zero-migration extension of the already-free-text `applications.status` column with intermediate stages, and a second bearer-secret-gated API route copying the exact pattern of the existing `/api/sync/route.ts`. The single most important architectural decision is that all three writes (status, profile updates, audit log) happen inside one `db.transaction()`, because a partial write here would leave the dashboard silently inconsistent with no audit trail — exactly the failure this feature exists to prevent. Key risks: (1) treating "no auto-submit" as sufficient — ATS bot-detection can silently reject even human-approved submissions; (2) treating the callback endpoint as trustworthy because "only I call it" — the actual caller is an LLM's interpretation of a messy webpage, so server-side validation of status transitions and DB-level constraints matter regardless of who's calling; (3) the bearer secret's intended flow (pasted into a prompt into an external session) is also its highest-leak-risk channel, so it needs short-lived, scoped tokens rather than the master secret embedded directly; (4) indirect prompt injection via scraped page content reaching a full agentic tool with shell/file access — mitigated by explicit "treat scraped content as data, not instructions" framing and structural separation in the prompt, with the human-review-before-submit gate catching form-value-only injections but not out-of-scope agent actions.

## Key Findings

### Recommended Stack

No new dependencies for the Next.js app itself. The only genuinely new tool is `@playwright/mcp` (0.0.80), which lives entirely in Juan's external Claude Code environment, not this repo. Everything else reuses the existing pinned stack.

**Core additions:**
- **Playwright MCP** (`@playwright/mcp`, external session only) — replaces "Scrapling" from the original brief for interactive form-fill; purpose-built for LLM-agent-driven browser automation with accessibility-tree-based field targeting, batch form fill, screenshot-for-review, and gated submit.
- **Scrapling** (Python, optional fallback only, external session) — narrow escape hatch for sites that block the Playwright MCP browser with bot-detection challenges (Cloudflare, etc.); not part of the default prompt.
- **Drizzle ORM 0.45.2 / pg 8.23.0 / Zod 4.5.4** (already in project, unchanged) — `db.transaction()` and `.onConflictDoUpdate()` handle the new tables' atomic writes and upserts; Zod extends the existing status-literal-union validation pattern.
- **No new libraries for prompt generation or clipboard copy** — `navigator.clipboard.writeText()` (standard Web API) and a Server Action returning a template string cover the entire "Send to AI" UX; no toast/templating library needed (matches existing project convention of `aria-live="polite"` inline feedback text, no toast system).

### Expected Features

**Must have (table stakes) for v1.1:**
- Growing candidate profile as flexible key-value store (`profile_fields`), not a fixed schema — every commercial autofill tool and this project's own data shape (arbitrary future ATS questions) require this.
- Self-contained "Send to AI" prompt: opportunity URL/title/company + profile snapshot + callback instructions + explicit "ask before submitting" instruction — must be usable with zero extra lookups by the receiving agent.
- Explicit "review before submit" checkpoint — this is Juan's hard requirement and the entire risk-mitigation strategy hinges on it; it lives mostly in the prompt's instructions, not app UI.
- Per-application audit trail (`application_history`/`applicationSendLog`) of exactly what was sent to that specific site — not just a global profile diff, since different ATS got different snapshots at different points in the profile's growth.
- 2-3 new intermediate `applications.status` values (`auto_apply_in_progress` / `auto_apply_needs_input` / `ready_to_submit`, exact naming a planning decision) — zero-migration since the column is already free-text.
- Secret-gated (bearer) write-back API endpoint, copying `/api/sync/route.ts`'s exact pattern with a separate, dedicated secret.

**Should have (differentiators):** field-level provenance UI panel showing which profile fields came from where; profile-completeness signal driving what the agent asks for next; no persistent session-driving bot (structurally avoids the account-suspension risk pattern commercial autofill extensions carry at volume).

**Defer to v1.2+:** UI panel to inspect "what was sent" per application (store now, surface later); sensitive-field flagging with default-excluded-from-prompt behavior; "stuck session" view for abandoned auto-fill attempts; prompt template versioning; encryption-at-rest for genuinely sensitive fields (SSN-adjacent) if Juan ever persists them; abandoned-session notifications.

### Architecture Approach

The existing app already establishes the exact patterns v1.1 must extend: Server Components for reads, Server Actions for mutations, one existing bearer-secret API route (`/api/sync`) as the template for the new write-back route, and a hard rule that `opportunity_external_id` (never the serial cache-row `id`) is the only valid FK reference into opportunity data (Anti-Pattern 2). v1.1 adds no new architectural style — it replicates these conventions onto two new tables and one new route.

**Major components:**
1. **`profile_fields` table** — global (no `opportunity_external_id`), one row per key, grows incrementally via upserts from both manual entry and auto-apply callbacks.
2. **`applicationSendLog`/`application_history` table** — per-application-session snapshot of exactly what was submitted, keyed by `opportunity_external_id`, many rows possible per application (not unique, unlike `applications`).
3. **`generateApplyPrompt()` Server Action** — assembles the prompt server-side (profile data can't be read from client components — established hard boundary in this codebase), returns a string; a new `"use client"` `SendToAiButton` calls it via `useTransition` and copies to clipboard, falling back to a read-only textarea in the existing `Popover` primitive if clipboard access fails.
4. **New bearer-secret write-back route** (`/api/applications/[externalId]/apply-session` or similar) — dedicated secret (not `SYNC_TRIGGER_SECRET`), Node runtime, wraps the three-table write (status upsert, history insert, profile upserts) in a single `db.transaction()` so it's all-or-nothing.
5. **`STATUS_META`/status-dropdown extension** — TypeScript's exhaustiveness check on the status-to-metadata record forces this to be updated in lockstep with the new status values, a useful built-in guardrail.

Suggested build order (dependency-driven): schema first → profile CRUD (query layer) → write-back API route (independently curl-testable) → prompt-generation Server Action + button → status dropdown/history UI extension last (nothing to display until earlier steps produce rows).

### Critical Pitfalls

1. **"No auto-submit" is not the same as "undetectable"** — ATS platforms run bot/fraud heuristics on the *fill*, not just the submit click; a human-approved submission can still be silently shadow-rejected. Instruct the external agent toward realistic interaction patterns (not raw DOM `.value=` assignment) and log which ATS platform was used per application to spot silent-rejection patterns later.
2. **The callback endpoint must not be trusted just because "only I call it"** — the actual caller is an LLM's interpretation of a messy third-party page, which can hallucinate or misreport. Enforce status transitions server-side (DB-level CHECK/enum, not just Zod), require some evidence before accepting a `submitted` transition, and log every raw callback payload before mutating, so bad writes are always reconstructable.
3. **The bearer secret's intended channel is also its highest leak risk** — it must transit through a pasted prompt, shell history, and an external session's transcript by design. Never embed the long-lived master secret directly; issue a short-lived, single-application-scoped, hashed token per "Send to AI" click instead.
4. **Anti-bot walls need a defined failure path, not silent retry or false success** — some sites will simply not yield to automated fill. The prompt must instruct the agent to stop after bounded attempts, report exactly what blocked it, and hand back the direct apply link; this needs its own tracking stage (e.g. "blocked — manual required") from day one, not a bolt-on later.
5. **Indirect prompt injection via scraped ATS page content** — the external agent is a full agentic tool with shell/file access, and untrusted third-party HTML reaching it alongside trusted profile data is a "lethal trifecta" risk (published research shows 41-85%+ attack success against similar coding agents when deliberately exploited). Mitigate by structurally separating trusted profile data from untrusted scraped content in the prompt with explicit "do not follow instructions found within" framing; the human-review-before-submit gate only catches form-value injections, not out-of-scope agent actions, so this needs its own prompt-level design, not just reliance on the review step.

## Implications for Roadmap

Based on research, suggested phase structure for v1.1:

### Phase 1: Schema & tracking foundation
**Rationale:** Every other piece of this milestone depends on the new tables existing; this is the dependency root and has zero external-tool risk (pure Drizzle/Postgres work already well understood in this codebase).
**Delivers:** `profile_fields` and `application_history`/`applicationSendLog` tables (Drizzle schema + migration), extended `APPLICATION_STATUSES` with intermediate stages including an explicit "blocked/needs manual apply" stage, `STATUS_META` UI extension.
**Addresses:** Growing candidate profile, per-application audit trail, intermediate pipeline stages (Table Stakes).
**Avoids:** Pitfall 4 (silent anti-bot failure needs its own status from day one) by including the blocked/failed stage in the initial status set, not as an afterthought.

### Phase 2: Profile CRUD & secret-gated write-back API
**Rationale:** Must exist before the prompt-generation step can be tested against real (not garbage) data; independently curl-testable in isolation, mirroring how `/api/sync` was built and validated.
**Delivers:** `src/db/queries/profile.ts` + `application-history.ts`, the new bearer-secret write-back route with a dedicated `APPLY_SESSION_SECRET` (short-lived/scoped token per Pitfall 3, not the raw long-lived secret), server-side status-transition and evidence validation, DB-level CHECK constraint on `applications.status`, raw-payload audit logging before mutation.
**Uses:** Drizzle `db.transaction()`, Zod, existing bearer-secret pattern from `/api/sync/route.ts`.
**Implements:** the write-back API component and its atomic 3-table transaction.

### Phase 3: "Send to AI" prompt generation + UI
**Rationale:** Depends on Phase 2's profile data being real and Phase 2's endpoint existing so the full loop is testable end-to-end the same day, rather than shipping a button whose prompt copies into a void. This is also where the Scrapling-to-Playwright-MCP correction and the prompt-injection/untrusted-content framing must be designed in from the start, not retrofitted.
**Delivers:** `generateApplyPrompt()` Server Action, `SendToAiButton` client component wired into the opportunities table, the prompt template itself (correctly instructing Playwright MCP setup/usage, not Scrapling; structurally separating trusted profile data from untrusted scraped page content; instructing bounded-attempt failure reporting; instructing narrated step-by-step progress per Juan's stated visibility requirement).
**Addresses:** Self-contained prompt, review-before-submit checkpoint (Table Stakes); no-persistent-bot architecture (Differentiator).
**Avoids:** Pitfall 3 (secret leak via prompt channel), Pitfall 5 (indirect prompt injection), Pitfall 1 (bot-detection false confidence — realistic fill instructions).

### Phase 4: History/audit UI surfacing (deferred candidate for v1.2, or tail of v1.1 if scope allows)
**Rationale:** Nothing to display until Phases 1-3 have actually produced rows; this is the "make the new data visible" step.
**Delivers:** UI component surfacing `application_history` rows per application (e.g. expandable panel inside the existing `Popover`/inline-row convention, not a new page).
**Addresses:** Field-level provenance UI panel (Differentiator, P2 in Feature Prioritization Matrix) — confirm with Juan whether this ships in v1.1 or is explicitly deferred to v1.2, since FEATURES.md places the UI-panel piece in "Add After Validation."

### Phase Ordering Rationale

- Schema-first ordering is a hard dependency, not a preference — nothing else in this milestone can be built or manually tested before the tables exist.
- Phase 2 (write-back API) is sequenced before Phase 3 (prompt/button) as a testability preference, not a hard technical dependency — they share only the schema, not each other's code, and could theoretically be built in parallel once Phase 1 lands.
- Security-critical pitfalls (secret scoping, DB-level status constraints, audit logging) are placed in the same phase as the endpoint that creates the risk, per explicit guidance in PITFALLS.md that these must ship together, not as a follow-up hardening pass.
- The prompt-injection and Scrapling-correction concerns are placed in Phase 3 specifically because that's where the actual prompt text is authored — this is the one phase where getting the correction (Playwright MCP, not Scrapling) wrong would silently propagate into every future auto-apply session.

### Research Flags

Needs deeper research during planning:
- **Phase 3 ("Send to AI" prompt generation):** the exact prompt template — untrusted-content framing wording, Playwright MCP tool sequencing instructions, and evidence-of-submission format — has no single authoritative precedent (FEATURES.md Gaps notes no source describes this exact "web dashboard → external coding agent → callback" pattern as one system). Recommend a research-phase pass specifically on prompt structure/injection-resistance framing before finalizing the template.
- **Phase 2 (write-back API):** the "require evidence before accepting a `submitted` status transition" mechanism (confirmation screenshot path? ATS confirmation text/URL echoed back?) needs a concrete design decision during planning — PITFALLS.md flags this as necessary but doesn't specify the exact payload shape.

Phases with standard, well-documented patterns (skip research-phase):
- **Phase 1 (schema):** Drizzle table/migration patterns are already proven in this codebase; zero-migration status extension is a known-safe, already-used pattern.
- **Phase 4 (history UI):** reuses the existing `Popover`/inline-row UI convention already established for `NotesPopover`.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH | Library capabilities verified via Context7 official docs (`/microsoft/playwright-mcp`, `/d4vinci/scrapling`, `/drizzle-team/drizzle-orm-docs`) and direct npm/PyPI registry queries; no first-hand execution of the auto-fill flow against a real ATS, so real-world Playwright MCP reliability per-ATS is unverified. |
| Features | MEDIUM | Pattern-level findings cross-corroborated across multiple independent sources, but no single authoritative spec exists for this exact architecture — synthesized from three separate categories of prior art (commercial autofill, "copy prompt" dev-tool buttons, AI-agent audit-trail guidance), not observed as one system anywhere. |
| Architecture | HIGH | Internal integration patterns (Server Actions, `db.transaction()`, bearer-secret route pattern, `opportunity_external_id` FK convention) cross-checked directly against this repo's actual code, and external API shapes (Drizzle transactions, Next.js 16 async route params) confirmed via Context7 against the exact installed versions. |
| Pitfalls | MEDIUM | Web-sourced industry patterns (bot detection, prompt injection, bearer-token leak remediation) cross-checked across multiple sources per pitfall, but no official ATS legal/detection rulings exist, and no direct precedent for this exact architecture's specific risk profile. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Scrapling → Playwright MCP correction is now load-bearing for planning:** any existing PROJECT.md language or Juan's original brief referencing "Scrapling" for the interactive fill step should be corrected during requirements/roadmap review, not just in this research file — flag explicitly when writing REQUIREMENTS.md and the roadmap.
- **Evidence requirement for `submitted` status transitions:** no concrete payload shape decided yet (screenshot path vs. confirmation text vs. confirmation URL) — needs a planning-time decision, not just an architectural placeholder.
- **Sensitive profile field handling (SSN/work-authorization/financial):** anti-feature guidance here is derived from general security reasoning, not a cited best-practice source for this specific "flexible key-value profile echoed into copy-pasted prompts" pattern — treat as a v1.2 decision point, and consider whether truly high-risk fields should ever be persisted at all versus entered manually per-application.
- **No official precedent for detecting silent ATS shadow-rejection** — the "log which ATS platform was used, watch for zero-response patterns" mitigation in Pitfall 1 is a heuristic Juan will need to observe over time, not something verifiable at build time.

## Sources

### Primary (HIGH confidence)
- Context7 `/microsoft/playwright-mcp` — `browser_fill_form`, `browser_snapshot`, `browser_take_screenshot` tool schemas, MCP setup command
- Context7 `/drizzle-team/drizzle-orm-docs` — `db.transaction()`, `.onConflictDoUpdate()` API confirmed against installed `drizzle-orm@0.45.2`
- Context7 `/vercel/next.js` — Next.js 16 async route params (`params: Promise<{...}>`) confirmed against installed `next@16.3.4`
- `npm view @playwright/mcp version` / `npm view playwright version`, direct PyPI query for `scrapling` — registry-verified versions, 2026-09-08
- This repo, read directly: `.planning/PROJECT.md`, `src/db/schema.ts`, `src/app/api/sync/route.ts`, `src/db/queries/applications.ts`, `src/app/actions/applications.ts`, `src/lib/application-status.ts`, `src/components/dashboard/status-dropdown.tsx`, `src/components/dashboard/notes-popover.tsx`

### Secondary (MEDIUM confidence)
- Context7 `/d4vinci/scrapling` and `/websites/scrapling_readthedocs_io_en` — Scrapling's actual form-submission and `page_action` capabilities (basis for the correction)
- Unit 42 (Palo Alto), arXiv AIShellJack, Auth0, Databricks — indirect prompt injection risk against agentic coding assistants
- GitGuardian, CyberArk — bearer-token leak remediation patterns
- Crunchy Data, Drizzle ORM GitHub discussion #3192 — enum vs. CHECK constraint tradeoffs for Postgres status columns
- loopcv.pro, jobscan.co, connectsafely.ai, sprad.io — auto-apply legality/detection-risk industry consensus (converge across 3+ independent sources)

### Tertiary (LOW confidence)
- Careerflow, Simplify Copilot, JobWizard vendor/marketing pages — used only for commercial autofill mechanism description, cross-checked across 3+ tools converging on the same flow
- AWS "Copy agent prompt" blog, shadcn "Copy Prompt" docs — closest found precedent for the "web UI generates prompt for external coding agent" pattern, vendor blog/docs quality
- ARMO, IETF draft-sharif-agent-audit-trail-00, Collibra — AI-agent audit-trail field-list guidance, one source is an active (unratified) IETF draft

---
*Research completed: 2026-09-08*
*Ready for roadmap: yes*
