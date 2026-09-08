---
phase: 03-application-tracking
plan: 02
subsystem: ui
tags: [tanstack-virtual, radix-ui, drizzle, postgres, nextjs-server-actions, playwright, a11y]

requires:
  - phase: 03-application-tracking
    provides: "applications table CRUD (getApplicationsByExternalIds/upsertApplicationStatus), updateApplicationStatus Server Action, StatusDropdown pattern, opportunity_external_id UNIQUE constraint (Plan 1)"
provides:
  - "upsertApplicationNotes()/updateApplicationNotes Server Action (src/db/queries/applications.ts, src/app/actions/applications.ts) — Zod-validated (max 2000 chars), never overwrites an existing status"
  - "NotesPopover (src/components/dashboard/notes-popover.tsx) — icon fill/outline + popover textarea, ~500ms debounced autosave, no explicit save button"
  - "VirtualizedOpportunitiesTable (src/components/dashboard/virtualized-opportunities-table.tsx) — @tanstack/react-virtual over the 16,109+-row Internships/Underclassmen tables, roving tabindex, real semantic table preserved"
  - "Defensive re-focus fix in StatusDropdown for a pre-existing (Plan 1) focus-loss-to-body bug after Server Action + revalidatePath"
  - "scripts/verify-a11y.ts extended with constant-time reachability assertion, mounted-row-count check, roving-tabindex check, and full StatusDropdown+NotesPopover keyboard walkthrough with no-focus-trap assertions"
affects: [phase-4-deploy]

actuals:
  tokens: 14413
  tasks: 3
  commits: 4

tech-stack:
  added: ["@tanstack/react-virtual"]
  patterns:
    - "Virtualizing a real semantic <table> for a11y: keep <thead>/<tbody>/<tr>/<td> at their default display values (never grid/block override, never absolutely-positioned <tr>) and represent total scroll height with leading/trailing aria-hidden spacer <tr> rows instead of an explicit height on <tbody> — explicit height on a table-row-group with far fewer real rows than needed causes browsers to redistribute that height onto the rows via the CSS table height algorithm (measured live: ~2.4M px per row), which is NOT documented as a footgun anywhere obvious and contradicts what TanStack Virtual's own docs description implies for their table example."
    - "Roving tabindex inside a virtualized table must set tabIndex=-1 on a row's interactive DESCENDANTS too (not just the <tr> itself) for every row except the currently-active one — otherwise Tab still steps through every mounted row's controls one by one, since a child's own tabIndex is independent of its ancestor row's."
    - "A Server Action + revalidatePath round-trip can silently drop keyboard focus to <body> ~100-400ms after the triggering UI library (Radix) already restored it to the trigger — the async Server Component refresh reconciles after Radix's own focus-restore fires, and if the reconciliation touches the focused row, the browser's default 'removed node loses focus to body' behavior kicks in. Fix: poll for a few hundred ms after the action resolves and re-focus if activeElement fell back to body."

key-files:
  created:
    - src/components/dashboard/notes-popover.tsx
    - src/components/dashboard/virtualized-opportunities-table.tsx
    - src/components/ui/popover.tsx
    - src/components/ui/textarea.tsx
    - scripts/verify-notes.ts
  modified:
    - src/db/queries/applications.ts
    - src/app/actions/applications.ts
    - src/app/page.tsx
    - src/components/dashboard/status-dropdown.tsx
    - scripts/verify-a11y.ts
    - package.json
    - pnpm-lock.yaml

key-decisions:
  - "Notes popover UI wired inline next to StatusDropdown in the same 'Postulación' column cell (not a separate column) — keeps the dense DESIGN.md table layout, no new column needed for a single icon button."
  - "Row-virtualization technique deviates from this plan's literal instruction (tbody height=getTotalSize()+translateY) after live measurement proved that combination breaks table row-height layout — replaced with leading/trailing spacer <tr> rows, the standard technique for virtualizing a real semantic <table> without CSS row-group height redistribution. Documented in the component's own comments and as a Rule 1 deviation below."
  - "StatusDropdown (Plan 1) gained a defensive re-focus poll after this plan's new keyboard walkthrough test caught a pre-existing focus-loss-to-<body> bug tied to the Server Action + revalidatePath pattern — not introduced by this plan, but only surfaced because no prior automated test exercised select-then-check-focus."
  - "Both StatusDropdown and NotesPopover gained an optional `tabIndex` passthrough prop so the virtualized table's roving-tabindex parent can exclude non-active rows' controls from the normal Tab sequence — without this, Tab would still step through every mounted row's dropdown/notes button one by one, defeating half the point of roving tabindex."

requirements-completed: [TRACK-02, TRACK-03]

coverage:
  - id: D1
    description: "Juan puede escribir una nota libre sobre cualquier fila de Internships/Underclassmen y la nota se autoguarda sin botón explícito (~500ms debounce), sobreviviendo un refresh"
    requirement: "TRACK-02"
    verification:
      - kind: integration
        ref: "scripts/verify-notes.ts against live Postgres (127.0.0.1:5434): upsertApplicationNotes creates a row with notes set + status defaulted to not_applied, never overwrites a pre-existing different status, repeated writes update the same row (no duplicates), getApplicationsByExternalIds exposes notes in its Map"
        status: pass
      - kind: e2e
        ref: "scripts/verify-a11y.ts full keyboard walkthrough: Enter opens NotesPopover, types text, Escape closes it and confirms the note persisted (icon switches to filled state) — run against live Postgres + production build"
        status: pass
    human_judgment: false
  - id: D2
    description: "El ícono de nota distingue relleno (tiene nota) vs. outline (vacía) sin depender solo de color"
    requirement: "TRACK-02"
    verification:
      - kind: automated_ui
        ref: "scripts/verify-a11y.ts: icon class includes fill-current only after a non-empty note is saved, confirmed via getComputedStyle/class inspection before and after a real save"
        status: pass
    human_judgment: false
  - id: D3
    description: "La tabla de Internships (16,109+ filas) es navegable por teclado en tiempo constante (no 6-13s), con roving tabindex funcional (flechas, Home/End) y sin trampa de foco al operar StatusDropdown/NotesPopover"
    requirement: "TRACK-03"
    verification:
      - kind: automated_ui
        ref: "scripts/verify-a11y.ts: tablist keyboard-reachable assertion (<3000ms, was 6000-13000ms pre-virtualization); mounted <tr> count assertion (13-27, was 16,109+); roving tabindex (.focus()->0, ArrowDown->1, End->16110, Home->0); full walkthrough operating StatusDropdown via arrows+Enter and NotesPopover via Enter/Escape with explicit no-focus-trap/no-focus-loss assertions at every step"
        status: pass
      - kind: integration
        ref: "Manual Playwright measurement (not committed, ad hoc during this session): StatusDropdown click on the unvirtualized pre-Task-3 build (commit ccb4036) never resolved after 30s-240s+ of waiting — a Radix Portal hideOthers-on-open cost proportional to total DOM node count. After virtualization, the identical click resolves in 400-1000ms."
        status: pass
    human_judgment: false
  - id: D4
    description: "pnpm exec tsc --noEmit && pnpm build run clean against the full plan's changes"
    verification:
      - kind: other
        ref: "pnpm exec tsc --noEmit (0 errors) and pnpm build (Compiled successfully, all routes generated) — re-run after each of the two live-bug fixes found during Task 3 (tbody-height row-stretching, StatusDropdown focus-loss)"
        status: pass
    human_judgment: false
  - id: D5
    description: "NotesPopover and the virtualized table's visual treatment genuinely read as part of the locked DESIGN.md 'Operator's Console' system (flat, hairline borders, no shadows, icon+text state indicators) rather than unreviewed shadcn defaults"
    verification: []
    human_judgment: true
    rationale: "Automated checks (tsc/build, live-data persistence, contrast ratios, DOM structure) prove correctness and the shadow-md fix on popover.tsx is documented, but whether the notes popover and dense virtualized rows visually read as native to DESIGN.md's aesthetic in the running app is a visual judgment best made by looking at it — no visual-diff harness exists in this stack."

duration: ~2h
completed: 2026-09-07
status: complete
---

# Phase 3 Plan 2: Notes Autosave + Row Virtualization + Accessibility Verification Summary

**Debounced-autosave notes popover (fill/outline icon, Zod-validated Server Action) plus a `@tanstack/react-virtual` refactor of the 16,109+-row Internships/Underclassmen table with roving tabindex, closing two live bugs (tbody row-height explosion, a pre-existing Server-Action focus-loss) discovered by the new Playwright keyboard walkthrough that verify-a11y.ts now runs on every future change**

## Performance

- **Duration:** ~2h
- **Completed:** 2026-09-07
- **Tasks:** 3 (package-legitimacy checkpoint pre-approved per environment notes, notes popover TDD RED/GREEN, virtualization tracer)
- **Files modified:** 12 (5 created, 7 modified)

## Accomplishments

- `upsertApplicationNotes()` (Drizzle `onConflictDoUpdate`, same pattern as Plan 1's `upsertApplicationStatus`) and `updateApplicationNotes` Server Action (Zod max-2000-char validation, T-03-03) — verified RED-then-GREEN against live Postgres via `scripts/verify-notes.ts`: creates a row with default status, never overwrites an existing different status, no duplicate rows on repeated writes
- `NotesPopover`: `StickyNote` icon (filled when a note exists, outline when empty — Never-Color-Alone Rule via shape, not color), Radix `Popover` + `Textarea`, ~500ms debounce (same `setTimeout`+cleanup pattern as `search-bar.tsx`), text "Guardando…/Guardado" indicator, Escape-to-close with native focus-return
- `VirtualizedOpportunitiesTable`: `@tanstack/react-virtual` over the existing scroll container, shared by Internships/Underclassmen; real `<table>`/`<thead>`/`<tbody>`/`<tr>`/`<td>` throughout with dynamic per-row measurement (Title/Location's `line-clamp-2` varies row height); roving tabindex with ArrowUp/Down/Home/End (`scrollToIndex`) and full tabIndex=-1 exclusion of non-active rows' controls
- Two real bugs found and fixed live during Task 3 (see Deviations): tbody explicit-height row-stretching, and a pre-existing StatusDropdown focus-loss-to-`<body>` after `revalidatePath`
- `scripts/verify-a11y.ts` extended: constant-time tab-switcher reachability assertion, mounted-DOM-row-count assertion, roving-tabindex assertion, and a full in-row keyboard walkthrough (StatusDropdown via arrows+Enter, NotesPopover via Enter/Escape) asserting no focus trap or loss at any step

## Task Commits

1. **Task 1: Package legitimacy checkpoint — `@tanstack/react-virtual` + shadcn `popover`/`textarea`** - pre-approved per environment notes; `npm view @tanstack/react-virtual` confirmed maintainer (Tanner Linsley) and no deprecation; `shadcn add popover textarea` introduced no new npm package beyond the already-audited `radix-ui` meta-package
2. **Task 2: Notes popover with debounced autosave** - RED `0026c11` (test), GREEN `ccb4036` (feat)
3. **Task 3: Row virtualization + roving tabindex + a11y verification** - `88a261e` (feat)

**Plan metadata:** (this commit, docs)

## Files Created/Modified

- `src/db/queries/applications.ts` - `upsertApplicationNotes()`
- `src/app/actions/applications.ts` - `updateApplicationNotes` Server Action, Zod max-2000-char validation
- `src/components/dashboard/notes-popover.tsx` - `NotesPopover` client component
- `src/components/ui/popover.tsx` - shadcn `popover` primitive (fixed: removed default `shadow-md ring-1`, same DESIGN.md Flat-By-Default fix as Plan 1's `select.tsx`)
- `src/components/ui/textarea.tsx` - shadcn `textarea` primitive
- `scripts/verify-notes.ts` - live-Postgres regression script (RED-then-GREEN)
- `src/components/dashboard/virtualized-opportunities-table.tsx` - `VirtualizedOpportunitiesTable`
- `src/app/page.tsx` - wired `VirtualizedOpportunitiesTable` into both Internships/Underclassmen `TabsContent`, removed the old inline `OpportunitiesTable`
- `src/components/dashboard/status-dropdown.tsx` - `tabIndex` passthrough prop + defensive re-focus fix
- `scripts/verify-a11y.ts` - extended with virtualization/roving-tabindex/keyboard-walkthrough checks
- `package.json` / `pnpm-lock.yaml` - `@tanstack/react-virtual` added

## Decisions Made

See `key-decisions` in frontmatter. In short: notes UI shares the existing "Postulación" cell with StatusDropdown (no new column); the plan's literal `tbody height=getTotalSize()+translateY` virtualization technique was replaced with the leading/trailing spacer-row technique after live measurement proved it broke table row-height layout; a pre-existing StatusDropdown focus-loss bug (Plan 1, tied to the Server Action + `revalidatePath` pattern) was fixed as part of this plan's own accessibility verification since it directly affects this plan's "no focus trap" must-have; both interactive row controls gained a `tabIndex` passthrough so roving tabindex actually excludes non-active rows' controls from the normal Tab sequence.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `<tbody>` explicit height caused CSS table row-height redistribution, not the plan's specified technique**
- **Found during:** Task 3, live Playwright measurement of the roving-tabindex `End` key (jumped to `null`/lost focus instead of the last row)
- **Issue:** The plan specified "altura total del `<tbody>` fijada por `getTotalSize()`" plus `transform: translateY`, matching TanStack Virtual's own docs description for their table example. Implemented exactly as specified, then measured live: with only ~13-27 real `<tr>` elements mounted inside a `<tbody>` given an explicit `height` far exceeding their natural content height, browsers apply the CSS table height-distribution algorithm and stretch those few real rows to fill the excess space — measured at ~2,457,670px for a SINGLE row (not a total), which then fed back into `measureElement`'s dynamic sizing and spiraled the virtualizer's total size into the tens of millions of pixels, breaking scroll position and `scrollToIndex`-driven roving-tabindex navigation entirely.
- **Fix:** Replaced with the leading/trailing `aria-hidden` spacer-`<tr>` technique: real rows keep their natural (dynamically measured) heights with no transform/explicit height, and two decorative spacer rows before/after represent the skipped-above and remaining-below scroll space, giving the container its correct total scrollable height without any row-group height redistribution.
- **Files modified:** `src/components/dashboard/virtualized-opportunities-table.tsx`
- **Verification:** `scripts/_tmp-debug-height.ts` (ad hoc, deleted) confirmed row heights returned to the expected 49-57px range; `scripts/verify-a11y.ts`'s roving-tabindex check (`End`→16110) now passes reliably.
- **Committed in:** `88a261e`

**2. [Rule 1 - Bug] Pre-existing StatusDropdown focus-loss to `<body>` after selecting an option (Plan 1 code, surfaced by this plan's new keyboard walkthrough)**
- **Found during:** Task 3, extending `verify-a11y.ts`'s keyboard walkthrough to operate StatusDropdown with arrows+Enter as this plan's own "done" criterion requires
- **Issue:** Radix `Select` restores focus to its trigger the instant an option is chosen (confirmed: Escape-close-without-selecting correctly returns focus to the trigger). But `updateApplicationStatus`'s `revalidatePath("/")` triggers a Server Component refresh that completes ~100-400ms *after* the Server Action call already resolved and Radix already restored focus — if that later refresh reconciles the focused row's DOM subtree, the browser's default "focused node removed → focus falls to `<body>`" behavior fires, silently losing keyboard position. This is a genuine, previously-undetected accessibility bug in Plan 1's `StatusDropdown` — never caught because no automated test previously exercised select-then-check-focus with a real keyboard interaction.
- **Fix:** Added a defensive re-focus poll (up to ~600ms, 75ms intervals) inside `StatusDropdown`'s `handleValueChange`, after the Server Action call: if `document.activeElement === document.body`, re-focus the trigger. Only reclaims focus when it was actually lost — never steals it from something the user has since Tabbed/clicked into.
- **Files modified:** `src/components/dashboard/status-dropdown.tsx`
- **Verification:** `scripts/verify-a11y.ts`'s full keyboard walkthrough (Tab into StatusDropdown, arrows+Enter to select, assert `document.activeElement` is never `<body>`) now passes reliably across repeated runs.
- **Committed in:** `88a261e`

**3. [Rule 2 - DESIGN.md compliance] Removed shadcn's default `shadow-md ring-1` from `popover.tsx`**
- **Found during:** Task 2, reviewing the generated `popover.tsx` against DESIGN.md before wiring `NotesPopover`
- **Issue:** Same class of violation Plan 1 found in `select.tsx` — shadcn's stock `popover` ships `PopoverContent` with `shadow-md ring-1 ring-foreground/10`, violating DESIGN.md's Flat-By-Default Rule (depth is tonal-layering + hairline border only, never a shadow).
- **Fix:** Replaced with `border border-border`, the same hairline token used everywhere else in the system.
- **Files modified:** `src/components/ui/popover.tsx`
- **Verification:** Visually confirmed no `shadow`/`ring` class present in the compiled className string.
- **Committed in:** `ccb4036`

---

**Total deviations:** 3 auto-fixed (2 real live-discovered bugs — one specific to this plan's own new virtualization code, one a pre-existing Plan 1 bug this plan's own verification requirement was designed to catch — and 1 recurring DESIGN.md-compliance fix on a freshly-generated shadcn primitive). No scope creep: all three are corrections needed for this plan's own stated goals (working virtualization; the "no focus trap" must-have; matching the locked visual system).

## Issues Encountered

- **Live Postgres port-forward + Playwright combined session ran into two environment hiccups, both resolved without touching plan scope:** (1) three orphaned `next-server` processes from a prior failed session attempt were still holding port 3921, requiring `kill -9` before this session's server could bind; (2) the Playwright Chromium binary version pinned by this session's `node_modules` (`chromium_headless_shell-1243`) wasn't yet downloaded to the local cache, requiring one `pnpm exec playwright install chromium` run mid-session. Neither affected the actual code changes.
- **Verifying NotesPopover/StatusDropdown click responsiveness against the PRE-virtualization build (commit `ccb4036`) required patience:** a real Playwright click on either control's trigger genuinely never resolved even after 240 seconds of waiting, confirming this plan's own stated premise (Task 2 made the existing Phase 2 keyboard-reachability regression worse) far more dramatically than the 6-13s figure documented in `02-03-SUMMARY.md` — this is Radix Portal's `hideOthers`-on-open cost scaling with total DOM node count (16,109+ rows × 2 interactive controls each), not a bug in either new component.
- **The initial virtualization implementation, built by faithfully following the plan's specified technique (`tbody` height + `translateY`), was itself broken** — see Deviation 1 above. Caught via automated Playwright assertion (roving-tabindex `End` key), not by visual inspection, before any commit.

## User Setup Required

None new. Local dev Postgres and `DATABASE_URL` continue to be passed inline per command (sandbox denies `.env*` writes, same workaround as Plan 1); production is unaffected since Dokploy sets `DATABASE_URL` directly.

## Next Phase Readiness

- **Phase 3 (Application Tracking) is now fully complete: TRACK-01 through TRACK-04 all satisfied** (TRACK-01/TRACK-04 in Plan 1; TRACK-02 and the remaining half of TRACK-03 in this plan).
- The Phase 2 blocker "Tabla de Internships (16,109 filas) sin virtualización — tab-switcher tarda 6-13s" (STATE.md Blockers/Concerns) is resolved — closed in this plan's state update.
- **Known follow-on optimization, out of this plan's scope:** virtualization reduced the raw HTML response from ~131MB to ~19MB by removing ~16,096 `<tr>` elements' worth of markup, but the remaining ~19MB is still the full row DATASET shipped as client-component props (needed for client-side virtualization/search to work without a server round-trip per scroll). A future phase could add server-side pagination or a lighter per-row payload shape if initial page-load transfer size becomes a concern — not blocking, since Postgres round-trip time (~880ms, unrelated to virtualization) currently dominates load time more than the payload size does.
- No blockers for Phase 4 (Deploy).

---
*Phase: 03-application-tracking*
*Completed: 2026-09-07*

## Self-Check: PASSED

All 13 referenced files (queries, Server Action, NotesPopover, popover.tsx, textarea.tsx, verify-notes.ts, virtualized-opportunities-table.tsx, page.tsx, status-dropdown.tsx, verify-a11y.ts, package.json, pnpm-lock.yaml, this SUMMARY) confirmed present on disk. All 3 task commit hashes (`0026c11`, `ccb4036`, `88a261e`) confirmed present in `git log --oneline`.
