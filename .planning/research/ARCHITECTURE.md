# Architecture Research

**Domain:** Personal single-user aggregation dashboard (external data ingestion + application tracking + AI-assisted auto-apply)
**Researched:** 2026-09-08 (v1.1 addendum to 2026-09-07 baseline)
**Confidence:** HIGH (internal integration patterns cross-checked against actual codebase; Drizzle transaction API and Next.js dynamic route handler API confirmed via Context7 official docs against installed versions `drizzle-orm@0.45.2` / `next@16.3.4`)

> **Note on this revision:** Sections 1-3 below (System Overview, Component Responsibilities, Patterns 1-3, Anti-Patterns 1-3) are the unchanged v1.0 baseline — kept verbatim because several source files cite them by name (e.g. `// research/ARCHITECTURE.md Anti-Pattern 2` in `db/schema.ts` and `db/queries/applications.ts`). **Section 4 ("v1.1 Extension: AI-Assisted Auto-Apply")** is the new research answering this milestone's integration questions. If you only need the v1.1 answer, skip to Section 4.

---

## 1. Standard Architecture (v1.0 baseline, unchanged)

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

| Component | Responsibility | Actual implementation in this repo |
|-----------|----------------|------------------------|
| Source Parsers (x3) | Fetch raw content, parse into normalized shape, tolerate source drift | `src/ingestion/sources/*.ts` |
| Refresh/Sync Job | Orchestrate parsers, upsert into cache tables, record `last_synced_at` | `src/ingestion/sync.ts`, `src/jobs/scheduled-sync.ts` |
| Cache Store (`opportunities`/`benefits`) | Durable, queryable snapshot — UI never talks to GitHub directly | Postgres tables, `src/db/schema.ts` |
| Application Store | User's own tracking data — never overwritten by refresh | Postgres `applications` table, keyed by `opportunity_external_id` |
| API Layer | Serve filtered data, expose refresh trigger, CRUD for applications | Server Components (reads) + Server Actions (mutations) + one bearer-secret POST route (`src/app/api/sync/route.ts`) |
| UI | Render list, filters, search, per-row application status control | `src/app/page.tsx` (Server Component) + `src/components/dashboard/*.tsx` (client islands) |

**Correction vs. original v1.0 doc:** the app does **not** use a generic REST `api/` layer for reads/CRUD as originally sketched — it uses Next.js Server Components for reads (`src/db/queries/*.ts` called directly from `page.tsx`) and Server Actions for mutations (`src/app/actions/*.ts`). The only actual `api/` route is the bearer-secret-gated sync trigger. This matters for Section 4: the new write-back endpoint is the **second** real API route in the app, and should copy `api/sync/route.ts`'s pattern exactly, not invent a new one.

## 2. Architectural Patterns (v1.0 baseline, unchanged)

### Pattern 1: Scheduled ETL into a cache table (not on-request fetch)
Background job fetches/parses GitHub sources on a schedule; UI/API only ever reads Postgres. Unchanged and irrelevant to auto-apply (auto-apply never touches the ingestion path).

### Pattern 2: Stable `external_id` for dedupe and application linkage
Each parsed opportunity gets a deterministic `external_id`; `applications.opportunity_external_id` references this value, never the cache table's serial `id`. **This is the pattern every new v1.1 table must also follow** — see Section 4.2.

### Pattern 3: Soft-delete / mark-stale instead of hard delete on sync
Unchanged, irrelevant to auto-apply.

## 3. Anti-Patterns (v1.0 baseline, unchanged — numbering preserved for existing code comments)

### Anti-Pattern 1: Fetching and parsing GitHub sources on every page load
Unchanged.

### Anti-Pattern 2: Storing application tracking state as a foreign key to an auto-increment cache row ID
**What people do:** `applications.opportunity_id` references `opportunities.id` (serial primary key).
**Why it's wrong:** Every sync re-upserts the cache; a serial-id FK breaks silently on re-upsert.
**Do this instead:** Reference the stable `external_id` value (Pattern 2), never the serial `id`.
**v1.1 applicability:** This rule extends to every new table this milestone adds. `profile_fields` doesn't reference an opportunity at all (it's global), so it's naturally exempt — but `application_history` **does** relate to an opportunity, and it must key off `opportunity_external_id`, exactly like `applications` already does. See Anti-Pattern 4 below for the specific new violation to avoid.

### Anti-Pattern 3: localStorage as the source of truth for application tracking
Unchanged, and extends to the new profile/history data too — see Section 4.1 for why the "Send to AI" prompt must be assembled from server-fetched Postgres data, not client-cached state.

---

## 4. v1.1 Extension: AI-Assisted Auto-Apply

**Confidence: HIGH** for items backed by this repo's existing code (read directly) and by Context7-verified official docs (Drizzle transactions, Next.js dynamic route handlers — both checked against this repo's installed versions). **MEDIUM** for the one genuinely new UX pattern (clipboard copy inside a shadcn/ui + RSC app), since it's a small enough surface that there's no single "canonical" library pattern to defer to — the recommendation below is original architecture reasoning, not a documented library API.

### 4.1 Where prompt-generation logic lives, and how "click to copy" works

**Decision: prompt assembly is a Server Action that returns the prompt string, not client-side string concatenation.**

Rationale, directly from this app's existing constraints:

- The profile data being snapshotted (`profile_fields`, new table, Section 4.2) lives in Postgres and is read via `db/queries/`. Every existing `db/queries/*.ts` module explicitly avoids being imported by client components (`applications.ts`'s own comment: *"no `pg` import — see that file's comment for why this module itself must never be imported from a client component"*). A client component cannot read `profile_fields` directly — it has no query module to call. This is not a style preference, it is a hard boundary already established in this codebase (`pg`/`tls`/`util/types` don't resolve in the browser bundle).
- Therefore the profile snapshot must be fetched server-side. Two ways to get server data into a client "copy" button: (a) pass the already-fetched profile as a prop from the Server Component page (`page.tsx` already reads `applicationsByExternalId` this way and passes it down row-by-row), or (b) a Server Action the client component calls on click. **Use (b), a Server Action**, not (a), for one concrete reason: the prompt also embeds the *specific opportunity's* `url`/`title`/`company` plus a fixed instruction block (Scrapling + "ask before submitting"), and assembling that full string is templating logic, not display logic — keeping it in one server-side function (`generateApplyPrompt(opportunityExternalId)`) means the prompt template has exactly one place to edit later (e.g. adding a new instruction line) instead of being duplicated across every row-render call site. It also means the prompt-building logic — which touches `profile_fields` values that may later include anything Juan adds (nothing stops him from storing something sensitive-ish, like a phone number, in a key-value profile field) — never round-trips through props embedded in server-rendered HTML for rows Juan never clicks; it's fetched only for the specific row's button press.
- This exactly mirrors the existing `updateApplicationStatus`/`updateApplicationNotes` pattern: `"use server"` action file (`src/app/actions/applications.ts`), invoked from a `"use client"` component via `useTransition`, Zod-validated input.

**New Server Action:** `src/app/actions/auto-apply.ts`

```typescript
"use server";

export async function generateApplyPrompt(
  opportunityExternalId: string,
): Promise<{ ok: true; prompt: string } | { ok: false; error: string }> {
  // 1. Zod-validate opportunityExternalId (same externalIdSchema pattern as applications.ts)
  // 2. Look up the opportunity by external_id (src/db/queries/opportunities.ts — add a
  //    getOpportunityByExternalId() if it doesn't exist yet; needed for title/company/url)
  // 3. Look up all profile_fields rows (src/db/queries/profile.ts, new — Section 4.2)
  // 4. Assemble the fixed prompt template (URL + profile snapshot + Scrapling instruction +
  //    "ask before submitting" instruction), return as a single string
}
```

**Click-to-copy component:** `src/components/dashboard/send-to-ai-button.tsx` (new, `"use client"`)

- Button calls `generateApplyPrompt(opportunityExternalId)` inside `useTransition` (same `isPending` disabled-state pattern as `StatusDropdown`).
- On success, calls `navigator.clipboard.writeText(prompt)` (standard browser Clipboard API — no library needed; it's synchronous-feeling but returns a Promise, works over HTTPS, which the Dokploy+Cloudflare deploy already provides).
- Feedback state: **do not introduce a toast library.** This app has no toast system by explicit convention (`StatusDropdown`/`NotesPopover` both comment "no toast/error-banner system yet," errors go to `console.error`, success feedback is an inline `aria-live="polite"` text string — see `NotesPopover`'s "Guardando…"/"Guardado" `<p aria-live="polite">`). Copy the exact same idiom: a local `copyState: "idle" | "copying" | "copied" | "error"` and an `aria-live="polite"` text node next to the button reading "Copiado" / "No se pudo generar el prompt" — zero new dependencies, consistent with `A11Y.md` (status changes announced to assistive tech, not conveyed by icon/color alone).
- If `navigator.clipboard.writeText` throws (permission denied, non-secure context edge case), fall back to rendering the prompt in a read-only `<Textarea>` inside the existing `Popover` primitive (already a project dependency, used by `NotesPopover`) so Juan can manually select-all/copy — no new shadcn component needs adding for the happy path, only reuse of `popover.tsx` + `textarea.tsx`, both already present in `src/components/ui/`.

**Anti-pattern to avoid:** do not assemble the prompt as a client-side template literal that interpolates a `profile` object passed down as a prop from `page.tsx` through the whole opportunities table (mirrors Anti-Pattern 3's spirit: a client-held copy of server data goes stale the instant Juan edits his profile in a different tab, and — worse here — it would force `page.tsx` to fetch and serialize the *entire* `profile_fields` table into every row's render for a button that's clicked rarely, bloating the RSC payload for the 16k-row Internships tab for no benefit).

### 4.2 New tables and the write-back API route

**New tables (both new, in `src/db/schema.ts`, same file/module the existing 4 tables live in):**

```typescript
/**
 * Juan's reusable application data, one row per key (e.g. "full_name",
 * "phone", "linkedin_url", "resume_summary"). Grows incrementally — no
 * fixed columns, matches the "flexible key-value profile" requirement.
 * Global, not per-opportunity: unlike `applications`, this table has no
 * `opportunity_external_id` at all (Anti-Pattern 2 doesn't apply — there is
 * no cache row it could dangle from).
 */
export const profileFields = pgTable("profile_fields", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Per-application log of exactly what was sent to a given site during an
 * auto-apply session — NOT the global profile. Keyed by
 * `opportunity_external_id`, never `opportunities.id` (Anti-Pattern 2 — the
 * exact same rule `applications` already follows). Many rows can exist per
 * application (one per auto-apply attempt/session), so this is NOT unique
 * on `opportunity_external_id` the way `applications` is.
 */
export const applicationHistory = pgTable("application_history", {
  id: serial("id").primaryKey(),
  opportunityExternalId: text("opportunity_external_id").notNull(),
  // Snapshot of what was actually submitted to that site this session —
  // JSONB, not a fixed shape, since it mirrors whatever profile_fields
  // subset + free-form notes the external Claude Code session reported back.
  submittedData: jsonb("submitted_data").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

Add an index on `applicationHistory.opportunityExternalId` (Drizzle `index()` in the table's third callback arg, or a follow-up migration) since every application-detail render will filter history by it, same access pattern as `applications` today.

**Modified table:** `applications.status` — currently `text` with 6 known values enforced only at the Zod layer (`APPLICATION_STATUSES` in `src/lib/application-status.ts`), not a Postgres enum type. **Keep it a free-text column; extend the Zod/TS constant, not the DB schema.** This is a deliberate continuity call: the column is already `text` (not `pg-core`'s `pgEnum`), so adding new values is a one-line change to `APPLICATION_STATUSES` in `src/lib/application-status.ts` with **zero migration** — no `ALTER TYPE ... ADD VALUE`, no downtime concern. Add the auto-apply intermediate stages there:

```typescript
export const APPLICATION_STATUSES = [
  "saved",
  "not_applied",
  "auto_apply_in_progress",  // new — external Claude Code session is actively working it
  "auto_apply_needs_input",  // new — session paused, waiting on Juan (missing field / needs OK)
  "ready_to_submit",         // new — auto-filled, awaiting Juan's final manual submit click
  "applied",
  "in_progress",
  "rejected",
  "accepted",
] as const;
```
(Exact labels/count are a product decision for planning, not architecture — the point is *where* they live and that it's a zero-migration change.)

**New write-back route:** `src/app/api/applications/[externalId]/apply-session/route.ts`

Structure — copy `src/app/api/sync/route.ts`'s bearer-secret pattern exactly, add the dynamic segment and the multi-table write:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { applications, applicationHistory, profileFields } from "@/db/schema";
import { z } from "zod";
import { APPLICATION_STATUSES } from "@/lib/application-status";

export const runtime = "nodejs"; // same reason as api/sync — pg needs Node TCP sockets

const bodySchema = z.object({
  status: z.enum(APPLICATION_STATUSES).optional(),
  notes: z.string().max(2000).optional(),
  submittedData: z.record(z.string(), z.unknown()), // what was sent to this site
  historyNotes: z.string().optional(),
  profileUpdates: z.array(z.object({ key: z.string().min(1), value: z.string() })).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ externalId: string }> }, // Next.js 16: params is a Promise, must await
) {
  const expectedSecret = process.env.APPLY_SESSION_SECRET; // separate secret from SYNC_TRIGGER_SECRET
  if (!expectedSecret) {
    return NextResponse.json({ ok: false, error: "Apply-session callback is not configured" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { externalId } = await params; // dynamic segment, Next.js 16 async params (confirmed via Context7 /vercel/next.js)
  const parsedBody = bodySchema.safeParse(await request.json());
  if (!parsedBody.success) {
    return NextResponse.json({ ok: false, error: parsedBody.error.message }, { status: 400 });
  }
  const { status, notes, submittedData, historyNotes, profileUpdates } = parsedBody.data;

  // Single atomic transaction across all 3 writes — confirmed current API via
  // Context7 /drizzle-team/drizzle-orm-docs (drizzle-orm@0.45.2, matches installed
  // version): db.transaction(async (tx) => { ... }), all-or-nothing commit/rollback.
  await db.transaction(async (tx) => {
    if (status || notes !== undefined) {
      await tx
        .insert(applications)
        .values({ opportunityExternalId: externalId, status: status ?? "auto_apply_in_progress", notes })
        .onConflictDoUpdate({
          target: applications.opportunityExternalId,
          set: { ...(status && { status }), ...(notes !== undefined && { notes }), updatedAt: new Date() },
        });
    }

    await tx.insert(applicationHistory).values({
      opportunityExternalId: externalId, // NEVER opportunities.id — Anti-Pattern 2
      submittedData,
      notes: historyNotes,
    });

    if (profileUpdates?.length) {
      for (const { key, value } of profileUpdates) {
        await tx
          .insert(profileFields)
          .values({ key, value })
          .onConflictDoUpdate({ target: profileFields.key, set: { value, updatedAt: new Date() } });
      }
    }
  });

  return NextResponse.json({ ok: true });
}
```

Why a transaction (new pattern for this codebase — nothing in `src/db/queries/upsert.ts` uses `db.transaction` today, it loops plain awaited upserts): this route, unlike the sync job, writes to **three different tables that must agree** — a history row without a matching status update (or vice versa) would leave the UI showing a stale status while the history panel shows a completed session, which is exactly the kind of silent inconsistency the app's existing `sync_log` table was built to prevent for ingestion (`PITFALLS.md Pitfall 3`). `db.transaction(async (tx) => {...})` is the confirmed Drizzle API (verified via Context7 against `drizzle-orm@0.45.2`, this repo's installed version) — an uncaught error inside the callback rolls back all three writes, so the external Claude Code session's callback either fully lands or fully fails, never partially.

**Why `[externalId]` in the route path, not `opportunity_external_id` in the JSON body:** matches REST convention for "update this specific application" and lets you validate the identifier before touching `request.json()` at all (fail fast on a malformed URL). It also mirrors `applications.opportunityExternalId` being the natural resource key everywhere else in the app (Server Actions take it as their first positional arg, not buried in a payload).

**New query module:** `src/db/queries/profile.ts` and `src/db/queries/application-history.ts` — same shape as the existing `src/db/queries/applications.ts`: plain exported async functions (`getAllProfileFields()`, `getHistoryByExternalId(externalId)`), no class, no repository abstraction, consistent with every other query module in this repo.

### 4.3 New/extended UI components and data flow

| Component | New or modified | Change |
|---|---|---|
| `src/db/schema.ts` | Modified | Add `profileFields`, `applicationHistory` tables |
| `src/lib/application-status.ts` | Modified | Extend `APPLICATION_STATUSES` array with intermediate stages |
| `src/db/queries/profile.ts` | **New** | Read/write `profile_fields` |
| `src/db/queries/application-history.ts` | **New** | Read `application_history` by `opportunity_external_id` |
| `src/db/queries/opportunities.ts` | Modified (maybe) | Add `getOpportunityByExternalId()` if a single-row-by-id lookup doesn't already exist — needed by the prompt-generation Server Action |
| `src/app/actions/auto-apply.ts` | **New** | `generateApplyPrompt()` Server Action (Section 4.1) |
| `src/app/api/applications/[externalId]/apply-session/route.ts` | **New** | Bearer-secret write-back route (Section 4.2) |
| `src/components/dashboard/send-to-ai-button.tsx` | **New** | Client component, per-row "Send to AI" button + copy feedback (Section 4.1) |
| `src/components/dashboard/status-dropdown.tsx` | **Modified** | `STATUS_META` record must gain an entry (label + icon) for every new status value, or the dropdown throws/renders `undefined` the first time an auto-apply callback sets a status this map doesn't know about. This is a **required**, not optional, change — the component is a `Record<ApplicationStatus, {...}>` keyed off the exact same exported union type that `APPLICATION_STATUSES` extension changes; TypeScript will fail the build if `STATUS_META` isn't extended in lockstep, which is a useful guardrail (the extension can't be forgotten silently) |
| `src/components/dashboard/status-pill.tsx` | Unchanged | Only renders open/closed (`isActive`), unrelated to `applications.status` — no change needed |
| `src/components/dashboard/virtualized-opportunities-table.tsx` | **Modified** | Add the new `SendToAiButton` alongside the existing `StatusDropdown`/`NotesPopover` in each row's actions cell (same roving-tabindex treatment already applied to those two — the row's action-cell focus management code explicitly enumerates its controls, so this is a required, not incidental, touch point) |
| Application detail / history view | **New** (component TBD by planning — e.g. `application-history-list.tsx`) | Something must render `application_history` rows per opportunity; doesn't exist yet in any form since v1.0 had no such data. Likely lives inside the same `Popover`/expandable-row pattern as `NotesPopover`, not a new page, to stay consistent with this app's "everything happens inline in the table row" convention |

**Data flow, end to end:**

```
[Juan clicks "Send to AI" on a row]
    ↓
[SendToAiButton, client] → generateApplyPrompt(opportunityExternalId)  [Server Action]
    ↓
[Server Action] → getOpportunityByExternalId() + getAllProfileFields()  [db/queries, server-only]
    ↓
[Server Action] → returns assembled prompt string
    ↓
[SendToAiButton] → navigator.clipboard.writeText(prompt) → "Copiado" (aria-live)
    ↓
[Juan pastes prompt into an EXTERNAL Claude Code session — outside this app's runtime]
    ↓                                                        (Scrapling browser automation,
    ↓                                                         Juan confirms submit manually)
[external session finishes] → POST /api/applications/:externalId/apply-session
    Authorization: Bearer <APPLY_SESSION_SECRET>
    Body: { status, notes, submittedData, profileUpdates }
    ↓
[route handler] → Zod validate → db.transaction:
    upsert applications (by opportunity_external_id)
    insert applicationHistory (opportunity_external_id, submittedData)
    upsert profileFields (by key, for each new/changed field)
    ↓
[Next page load / revalidation] → StatusDropdown renders new intermediate status,
    history component renders the new applicationHistory row, profile view (if any)
    reflects updated profileFields
```

Note this callback route does **not** call `revalidatePath` — unlike the Server Actions (`updateApplicationStatus`/`updateApplicationNotes`), the caller here is an external process with no open browser tab to revalidate for. The dashboard is already `export const dynamic = "force-dynamic"` (`page.tsx`), so the next time Juan actually loads/refreshes the page, it re-queries Postgres and shows the callback's result naturally — no cache to invalidate.

### 4.4 Suggested build order

Dependencies drive this order — each step's UI/API depends on the previous step's data existing:

1. **Schema first:** add `profileFields`, `applicationHistory` tables to `src/db/schema.ts`, generate + apply the Drizzle migration (`drizzle-kit generate` / `migrate`), extend `APPLICATION_STATUSES`. Nothing else can be built or even manually tested before this lands — it's the dependency root for every other step.
2. **Profile CRUD (query layer, no UI yet):** `src/db/queries/profile.ts` (`getAllProfileFields`, `upsertProfileField`) and a minimal Server Action to write it. **Must exist before prompt-generation**, since the prompt needs real profile data to snapshot — building the "Send to AI" button against an empty/nonexistent profile table means testing it against garbage. If planning wants a "profile settings" page for Juan to seed initial values by hand (not just via auto-apply callbacks), that UI belongs in this step too.
3. **Write-back API route:** `src/app/api/applications/[externalId]/apply-session/route.ts` + `src/db/queries/application-history.ts`. Buildable and testable in isolation with `curl`/Postman against the bearer secret, exactly like `api/sync` was — does not require the "Send to AI" button to exist yet, only the schema from step 1.
4. **Prompt-generation Server Action + "Send to AI" button:** `src/app/actions/auto-apply.ts` + `send-to-ai-button.tsx`, wired into `virtualized-opportunities-table.tsx`. Depends on step 2 (real profile data to read) and benefits from step 3 already existing so the full loop (copy prompt → paste into Claude Code → callback lands → UI reflects it) is testable end-to-end the same day, rather than shipping a button that copies a prompt into a void.
5. **Status dropdown + history UI extension:** extend `STATUS_META` in `status-dropdown.tsx` for the new intermediate statuses (small, mechanical, but TypeScript will force this the moment step 1's `APPLICATION_STATUSES` changes — treat the build error as the checklist), and build whatever surfaces `application_history` rows per application (new component, Section 4.3). This is last because it's the "make the new data visible" step — there is nothing to display until steps 1-3 have actually produced rows.

**Explicit non-dependency worth calling out to planning:** step 3 (write-back route) and step 4 (Send to AI button) do **not** depend on each other and can be built in either order or in parallel once step 1 and step 2 are done — they only share the schema and the profile data, not each other's code. Sequencing them 3-then-4 above is a testability preference (having the callback endpoint ready means the button's full loop is verifiable sooner), not a hard technical dependency.

## Sources

- This repo, read directly: `.planning/PROJECT.md`, `src/db/schema.ts`, `src/app/api/sync/route.ts`, `src/db/queries/applications.ts`, `src/app/actions/applications.ts`, `src/lib/application-status.ts`, `src/components/dashboard/status-dropdown.tsx`, `src/components/dashboard/notes-popover.tsx`, `src/db/client.ts`, `src/db/queries/upsert.ts`, `src/app/page.tsx`, `src/components/ui/*` (HIGH confidence — primary source, current codebase state as of 2026-09-08)
- Context7 `/drizzle-team/drizzle-orm-docs` — `db.transaction()` API, `onConflictDoUpdate` upsert syntax, confirmed against installed `drizzle-orm@0.45.2` (HIGH confidence, official docs)
- Context7 `/vercel/next.js` — dynamic route segment `params: Promise<{...}>` handling in App Router Route Handlers, confirmed against installed `next@16.3.4` (HIGH confidence, official docs)
- `navigator.clipboard.writeText()` — standard Web API (MDN), no library dependency; requires a secure context (HTTPS), already satisfied by the Cloudflare+Dokploy deploy target per `STACK.md` (MEDIUM confidence — well-established browser API, not independently re-verified this session, but not a claim likely to have drifted)
- v1.0 baseline (Sections 1-3): `.planning/research/ARCHITECTURE.md` as researched 2026-09-07 (HIGH confidence, preserved because existing code comments cite specific anti-pattern numbers)

---
*Architecture research for: Personal opportunities/benefits aggregation dashboard — v1.1 "Auto-apply asistido con IA"*
*Researched: 2026-09-08*
