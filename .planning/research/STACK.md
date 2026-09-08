# Stack Research — v1.1 Auto-apply asistido con IA

**Domain:** Adding an AI-assisted, human-reviewed "auto-fill" workflow (external Claude Code session + browser automation against arbitrary ATS forms) plus a flexible profile store and a secret-gated write-back API to an existing Next.js 16 / Drizzle / Postgres dashboard
**Researched:** 2026-09-08
**Confidence:** MEDIUM-HIGH (library capabilities verified via Context7 official docs; npm/PyPI versions verified via direct registry queries; no first-hand execution of the auto-fill flow against a real ATS)

## Important Correction to the Stated Plan

Juan's milestone brief says the generated prompt should instruct the external Claude Code session to "use Scrapling." **This needs to change.** Scrapling is not a form-filling / interactive-browser-automation library — it's an adaptive **scraping/extraction** library. Its own documented "form submission" capability is a raw HTTP POST with a hardcoded field dictionary (`Fetcher.post(url, data={'username': ..., 'password': ...})`), which does not work against JS-rendered SPA application forms (Workday is a heavy SPA; most Greenhouse/Lever embeds are JS-driven too). Scrapling's browser-based fetchers (`DynamicFetcher`, `StealthyFetcher`) do wrap a real browser, but the only way to do custom interaction (fill a field, click a button) through them is a `page_action` callback that hands you a **raw Playwright (or Camoufox) `Page` object** — at that point you are just writing plain Playwright code, with Scrapling adding an extra dependency and no extra capability for this specific job.

The right tool for "open a page, inspect form fields, fill them, screenshot for review, wait for Juan's OK, then submit" is **Playwright MCP** (`@playwright/mcp`, Microsoft's official MCP server for Playwright), added as an MCP server to the external Claude Code session. It exposes exactly this workflow as native tools (`browser_navigate`, `browser_snapshot`, `browser_fill_form`, `browser_take_screenshot`, `browser_click`) with no Python scripting required — a much closer match to "paste a prompt into a Claude Code session and let it drive the browser conversationally" than either raw Scrapling or hand-rolled Playwright Python.

**Recommendation:** change the generated prompt's instruction from "use Scrapling" to "use the Playwright MCP server (`@playwright/mcp`, add it once via `claude mcp add playwright npx @playwright/mcp@latest` if not already added) to inspect, fill, screenshot, and — only after my explicit OK — submit the form." Scrapling still has one legitimate, narrow fallback role documented below.

## Recommended Stack

### Core Additions (for the auto-apply workflow)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@playwright/mcp` | 0.0.80 (verified via `npm view`, 2026-09-08) | MCP server giving the **external** Claude Code session real browser control: navigate, read the accessibility tree of a form, fill fields, screenshot, click submit | Purpose-built by Microsoft for LLM-agent-driven browser automation. `browser_snapshot` gives Claude a structured accessibility tree of the form (reliable field targeting without vision models), `browser_fill_form` fills a batch of `{target, value, type}` fields in one call, `browser_take_screenshot` produces the image Juan reviews before OK-ing, and `browser_click` performs the final submit only when explicitly invoked after that OK. This is a one-time local MCP registration (`claude mcp add playwright npx @playwright/mcp@latest`) in Juan's own Claude Code environment — **it is not a dependency of the Next.js app** and never ships in the Docker image. |
| `playwright` (Node, pulled in transitively by `@playwright/mcp`) | 1.63.0 (verified via `npm view`, 2026-09-08) | Underlying browser-automation engine that `@playwright/mcp` drives | You don't install this directly — `npx @playwright/mcp@latest` manages its own Playwright + browser binaries. Documented here only so the version is pinned/traceable if Juan ever needs to debug the MCP server's browser layer directly. |

### Optional Fallback (narrow, not part of the default prompt)

| Technology | Version | Purpose | When to actually use it |
|------------|---------|---------|--------------------------|
| Scrapling (`scrapling[fetchers]`, Python) | 0.4.15 on PyPI (verified 2026-09-08) | Adaptive scraping + `StealthySession` (Camoufox-based stealth browser) that can get past bot-detection challenges (e.g. Cloudflare) a vanilla Playwright/Chromium session might get blocked on | Only if a specific ATS/company careers page actively blocks the Playwright MCP browser with a bot challenge. In that narrow case, have the Claude Code session `pip install "scrapling[fetchers]"` ad hoc and use `StealthySession(solve_cloudflare=True)` just to get past the challenge/establish a session, then either continue with Scrapling's `page_action` (raw Playwright underneath anyway) or hand off. Do **not** bake this into the default "Send to AI" prompt — it's a documented escape hatch, not the primary path, since most ATS vendors (Greenhouse, Lever, Workday's public apply pages) don't run aggressive bot-detection on the apply form itself. |

### Database (existing stack extended, no new libraries)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Drizzle ORM | 0.45.2 (already in project — unchanged) | New `profileFields` (key-value) + `applicationSendLog` (per-application history) tables, in the same `src/db/schema.ts` | No new ORM needed. `db.transaction(async (tx) => {...})` (stable in the pinned version) lets the write-back endpoint update `applications` status/notes, upsert `profileFields`, and insert an `applicationSendLog` row **atomically in one request** — verified current via Context7 (`/drizzle-team/drizzle-orm-docs`). |
| `pg` (node-postgres) | 8.23.0 (already in project — unchanged) | Driver underneath Drizzle's transaction/pool | No change required. |
| Zod | 4.5.4 (already in project — unchanged) | Runtime validation of the new write-back endpoint's JSON body (status, notes, profile updates array, send-log entry) and of the extended status-stage literal union | Same pattern already used for Server Action input validation — extend the existing status Zod schema with the new intermediate stage literals (see below), no new library. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None new required for the Next.js app itself | — | — | The "Send to AI" button only needs to (1) render a template string combining the opportunity URL + a snapshot of `profileFields` + the fixed instruction block, and (2) copy it to the clipboard via the standard browser `navigator.clipboard.writeText` API. No prompt-templating or clipboard library is needed for this. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Claude Code CLI, in the **external** session only | Runs the actual auto-fill workflow, driven by the copied prompt | Not part of this repo/deploy at all — it's Juan's own separate terminal session. Document the one-time `claude mcp add playwright npx @playwright/mcp@latest` setup step in the app's README or in the generated prompt itself, since a fresh Claude Code session won't have the MCP server registered by default. |

## Installation

```bash
# Nothing new to install in the Next.js app's package.json for auto-apply itself —
# Playwright MCP runs inside the EXTERNAL Claude Code session's own environment,
# not inside this repo or its Docker image.

# One-time setup, run once by Juan in his own shell (not part of this repo):
claude mcp add playwright npx @playwright/mcp@latest

# Optional fallback only, run ad hoc inside the external session if a specific
# ATS blocks the Playwright MCP browser (not a project dependency, not pinned
# in any lockfile here):
pip install "scrapling[fetchers]"
```

No changes to this repo's `package.json` are required for the browser-automation side of this milestone. The only code changes inside the Next.js app are: the new Drizzle tables (`src/db/schema.ts`), a Drizzle migration, the new secret-gated API route, the extended Zod status schema, and the "Send to AI" button/prompt-template UI — all using libraries already in the stack (Drizzle, pg, Zod, shadcn/ui).

## Schema Pattern: Flexible Key-Value Profile Store (Drizzle)

Model it as one row per field (EAV-style), not a single JSONB blob, to stay consistent with the existing `applications.opportunityExternalId` unique-key + `onConflictDoUpdate` upsert pattern already used in this codebase, and because profile values here are fundamentally scalar strings (name, phone, LinkedIn URL, graduation date, etc.) that the external session discovers and writes back one at a time:

```typescript
// src/db/schema.ts — add alongside the existing tables

/**
 * Flexible key-value profile store. Grows incrementally: no required schema
 * for "all possible fields" — the external auto-apply session upserts
 * whatever it learns (e.g. key='phone_number', value='+51...') via
 * onConflictDoUpdate({ target: profileFields.key }), same upsert pattern as
 * `applications.opportunityExternalId`.
 */
export const profileFields = pgTable("profile_fields", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  // 'manual' (Juan typed it in the dashboard) | 'ai_session' (learned during
  // an auto-apply run) — lets the UI flag fields worth double-checking.
  source: text("source").notNull().default("manual"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Per-application history of what was actually sent to a given site — not
 * just the current global profile snapshot. One row per "Send to AI"
 * attempt/session. References applications by the VALUE of
 * opportunity_external_id (never a serial FK), same anti-pattern-2
 * convention as `applications` itself.
 */
export const applicationSendLog = pgTable("application_send_log", {
  id: serial("id").primaryKey(),
  opportunityExternalId: text("opportunity_external_id").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  // Snapshot of {profileFieldKey: valueSent} actually used to fill this
  // specific form — kept even if profileFields later changes.
  fieldsSent: jsonb("fields_sent").notNull(),
  notes: text("notes"),
});
```

Why not a single JSONB blob for `profileFields`: Drizzle has no first-class typed helper for partial JSONB merges (you'd hand-write `sql\`jsonb_set(...)\`` fragments), whereas one-row-per-key lets the write-back endpoint upsert each learned field with the exact same `.onConflictDoUpdate({ target: profileFields.key })` call already proven in `src/db/applications` logic — less new SQL to get right, easier to reason about "what does Juan's profile currently look like" as a plain `SELECT * FROM profile_fields`.

Why JSONB *is* right for `applicationSendLog.fieldsSent`: that's a point-in-time snapshot, not something queried by individual key — an array of arbitrary `{key, value}` sent to one specific site on one specific date. Matches the existing `opportunities.raw` / `benefits.tags` JSONB usage already in the schema for "keep the whole structured payload, don't normalize."

**Extended tracking stages:** `applications.status` is already a plain `text()` column (no Postgres enum type), so adding the new intermediate stages (`ai_session_started` / `ready_to_submit` / `submitted`, or whatever literal names Juan prefers) is a **zero-migration change** — just extend the Zod literal union that already validates Server Action/API input for this column. Do not convert it to a Postgres `pgEnum` for this; the existing free-text + Zod-validated pattern is simpler to extend later and matches how the column already works.

## New Secret-Gated Write-Back Endpoint

Replicate `src/app/api/sync/route.ts`'s exact pattern — same shape, different secret:

```typescript
// src/app/api/auto-apply/callback/route.ts
export const runtime = "nodejs"; // pg/Drizzle require Node TCP sockets, same as /api/sync

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.AUTO_APPLY_CALLBACK_SECRET;
  // ...same "not configured -> 500", "Bearer mismatch -> 401" checks as /api/sync...

  const body = autoApplyCallbackSchema.parse(await request.json()); // Zod-validated

  await db.transaction(async (tx) => {
    await tx.update(applications).set({ status: body.status, notes: body.notes })
      .where(eq(applications.opportunityExternalId, body.opportunityExternalId));
    for (const field of body.profileUpdates ?? []) {
      await tx.insert(profileFields).values({ key: field.key, value: field.value, source: "ai_session" })
        .onConflictDoUpdate({ target: profileFields.key, set: { value: field.value, source: "ai_session" } });
    }
    if (body.sendLog) {
      await tx.insert(applicationSendLog).values({
        opportunityExternalId: body.opportunityExternalId,
        fieldsSent: body.sendLog.fieldsSent,
        notes: body.sendLog.notes,
      });
    }
  });

  return NextResponse.json({ ok: true });
}
```

Key decisions:
- **Use a separate secret** (`AUTO_APPLY_CALLBACK_SECRET`), not `SYNC_TRIGGER_SECRET`. This endpoint is invoked by an external Claude Code session (potentially long-lived, copy-pasted into a prompt Juan might paste into other tools), while `/api/sync`'s secret is only ever used by the app's own internal cron/manual trigger. Independent secrets mean either can be rotated without breaking the other.
- **Wrap the three writes in `db.transaction()`** — a single auto-apply session's callback should either fully land (status + profile learnings + send-log) or not at all; partial writes would leave the dashboard showing a status change with no corresponding audit trail, or vice versa.
- **Same runtime/auth pattern as `/api/sync`** — Node runtime (Drizzle needs `pg`'s TCP sockets, unavailable on Edge), bearer-token comparison against an env var, 500 if unconfigured, 401 on mismatch. No new pattern to invent.
- **Reuse Zod**, don't add a new validation library, for the request body schema (extend/import the same status-literal union used elsewhere).

## Alternatives Considered

| Recommended | Alternative | Why Not (or when it *would* apply) |
|-------------|-------------|-------------------------------------|
| Playwright MCP (`@playwright/mcp`) for interactive form-fill | Scrapling (as Juan's brief originally specified) | Scrapling's own "form submission" is a static HTTP POST with a hardcoded field dict — does not render/interact with JS-based SPA application forms at all. Its browser fetchers only support custom interaction by dropping into a raw Playwright `Page` via `page_action`, which is just Playwright with extra steps for this exact job. |
| Playwright MCP for interactive form-fill | Raw Playwright (Python), hand-scripted per session | Works, but every auto-apply session would require the Claude Code session to write and debug a fresh Python script instead of calling ready-made `browser_snapshot` / `browser_fill_form` / `browser_take_screenshot` tools. Playwright MCP is Playwright with an agent-friendly tool surface already built for exactly this "inspect → fill → screenshot → confirm → submit" loop — less to get wrong per session. |
| Playwright MCP for interactive form-fill | `browser-use` (Python, LLM-driven autonomous browser agent) | `browser-use` is designed for fully autonomous multi-step browsing decided by an LLM loop, which is a heavier, less controllable fit than Playwright MCP's discrete tool calls (navigate/snapshot/fill/screenshot/click) that Claude Code itself sequences — and it would add a second Python browser-automation dependency on top of Playwright MCP's own Node-based Playwright install, for no added benefit given Juan's human-in-the-loop requirement (Claude Code, not `browser-use`'s own agent loop, should decide when to ask Juan for missing data and when to submit). |
| One-row-per-key `profileFields` table | Single `profile` row with a JSONB blob column | A JSONB blob is simpler to read as one object, but Drizzle has no typed helper for partial-key JSONB updates (you'd hand-write `jsonb_set` SQL fragments), and it breaks the "upsert by unique key" pattern already established for `applications`. Reconsider a JSONB blob only if the number of distinct profile keys grows into the hundreds and per-key querying stops mattering. |
| Scrapling only as a documented fallback | Scrapling as the primary/default tool in the generated prompt | See "Important Correction to the Stated Plan" above — it is not the right default tool for this job. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| Adding `playwright` or `scrapling` as dependencies of the Next.js app (`package.json`) | Browser automation runs in the **external** Claude Code session's own environment (Playwright MCP manages its own browser install via `npx`), not inside this app's Docker container. The app itself only generates a text prompt and exposes a write-back API — it never launches a browser. Adding these here would bloat the Docker image and add an unused headless-Chromium download to every deploy. | Keep Playwright/Scrapling entirely outside this repo; document the one-time `claude mcp add playwright ...` setup step instead. |
| A new ORM or query builder for the profile/send-log tables | Drizzle already models everything this milestone needs (flat key-value rows, JSONB snapshots, transactions, upserts) — introducing a second data-access layer for two new tables would fragment the codebase for no capability gain. | Extend `src/db/schema.ts` with Drizzle, as shown above. |
| An auth framework (NextAuth, Clerk, Auth.js, etc.) for the new callback endpoint | This is a single-user personal tool; the existing bearer-secret pattern (`/api/sync`) already solves "only I can call this," and a full auth framework would add session/user-model complexity with zero benefit for one caller. | Reuse the bearer-secret pattern with a dedicated `AUTO_APPLY_CALLBACK_SECRET`. |
| A job queue / message broker (BullMQ, Redis-backed queues) for the callback | The write-back is a single synchronous request from the external Claude Code session when its auto-apply run finishes — there's no background processing, retries-at-scale, or multi-worker need here. | A plain `POST` handler with a `db.transaction()`, exactly like the existing `/api/sync` route. |
| `browser-use` or other autonomous-LLM-browser-agent libraries as the default | See Alternatives Considered — redundant with Playwright MCP for this human-reviewed, step-by-step workflow, and it's a second heavyweight Python browser dependency for the same job. | Playwright MCP. |
| Converting `applications.status` to a Postgres `pgEnum` for the new intermediate stages | Forces a migration + `ALTER TYPE ... ADD VALUE` dance every time a new stage name is needed later, and Postgres historically restricted adding enum values inside a transaction in older versions. The column is already a validated free-text field. | Keep `text()`, extend the Zod literal union used for validation. |

## Stack Patterns by Variant

**If a specific target ATS blocks the Playwright MCP browser with bot-detection (rare):**
- Have the external session fall back to Scrapling's `StealthySession(solve_cloudflare=True)` (Camoufox-based) just to get past the challenge, then hand off to Playwright/Playwright MCP for the actual fill-and-submit, or continue via Scrapling's own `page_action` (which is Playwright underneath anyway).
- Because this is a documented escape hatch for an edge case, not something worth complicating the default "Send to AI" prompt with — most ATS apply pages (Greenhouse, Lever, Workday's public apply flow) do not run aggressive bot-detection challenges on the form itself.

**If the number of distinct `profileFields` keys grows very large (hundreds) and per-key querying stops mattering:**
- Reconsider collapsing to a single JSONB blob row with `jsonb_set` merges.
- Because at that scale the upsert-per-row pattern adds many small writes for what's conceptually one profile object — but this is not the case at this milestone's expected scale (dozens of fields).

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|------------------|-------|
| `@playwright/mcp@0.0.80` | `playwright@1.63.0` (pulled in transitively) | Managed entirely by `npx @playwright/mcp@latest` in the external Claude Code session; not installed in this repo, so no compatibility constraint against this project's `next@16.3.4` / `react@19.2.8` versions. |
| `drizzle-orm@0.45.2` (unchanged) | `drizzle-kit@0.31.10`, `pg@8.23.0` (unchanged) | `db.transaction()` and `.onConflictDoUpdate()` used for the new tables are stable in this already-pinned version — no bump required for this milestone. |
| `scrapling[fetchers]` (optional fallback, PyPI 0.4.15) | Python 3.9+ (per Scrapling's own install docs), independent Python environment | Not installed anywhere in this repo or its lockfiles — purely an ad hoc `pip install` inside the external Claude Code session if the fallback case above is hit. |

## Sources

- Context7 `/d4vinci/scrapling` and `/websites/scrapling_readthedocs_io_en` — verified Scrapling's `page_action` (raw Playwright/Camoufox `Page` handoff), `find_by_text`/adaptive CSS relocation, and the raw-HTTP-POST "form submission" example (MEDIUM confidence — official project docs, cross-checked across two indexed doc sources)
- Context7 `/microsoft/playwright-mcp` — verified `browser_fill_form`, `browser_snapshot`, `browser_take_screenshot` tool schemas and the `claude mcp add playwright npx @playwright/mcp@latest` setup command (MEDIUM confidence — official Microsoft repo docs)
- Context7 `/microsoft/playwright-python` — verified `page.fill`, `locator.click`, `page.goto` sync/async API shapes (MEDIUM confidence — official docs)
- Context7 `/drizzle-team/drizzle-orm-docs` — verified `db.transaction()` and `.onConflictDoUpdate({ target, set })` API shapes against the project's pinned Drizzle version (MEDIUM confidence — official docs)
- `npm view @playwright/mcp version` / `npm view playwright version` — direct npm registry query, 2026-09-08 (HIGH confidence — primary source): `@playwright/mcp@0.0.80`, `playwright@1.63.0`
- `curl https://pypi.org/pypi/scrapling/json` — direct PyPI registry query, 2026-09-08 (HIGH confidence — primary source): `scrapling@0.4.15`
- Existing project files read directly: `.planning/PROJECT.md`, `src/db/schema.ts`, `src/app/api/sync/route.ts`, `.claude/CLAUDE.md` — used to keep new patterns consistent with the codebase's own established conventions (HIGH confidence — primary source, this repo)

---
*Stack research for: Opportunities Hub v1.1 — Auto-apply asistido con IA*
*Researched: 2026-09-08*
