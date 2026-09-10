# Phase 5 — UI Review

**Audited:** 2026-09-08
**Baseline:** `.planning/phases/05-perfil-y-etapas-de-tracking/05-UI-SPEC.md`
**Screenshots:** captured (desktop 1440x900, mobile 375x812) via local dev server on port 3001

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 4/4 | Every declared string (empty state, CTAs, save indicators, 3 new status labels) matches the Copywriting Contract verbatim. |
| 2. Visuals | 2/4 | Long unbroken field values (URLs) break out of the card container and off-screen instead of wrapping — a visible layout defect on the exact use case the spec calls out ("full CV/resume URL"). |
| 3. Color | 4/4 | `violet-tint-surface` (`#1e1930`) correctly wired via the existing `--accent`/`--accent-foreground` tokens for the 3 new statuses; no 4th raw Signal Violet use introduced; `StatusPill` correctly left untouched. |
| 4. Typography | 3/4 | Category-group header correctly uses the remapped `text-sm` (13px/500 = Label); row label/value spans carry no explicit size class and fall back to the browser default instead of the declared 15px Body token. |
| 5. Spacing | 4/4 | `p-4` (16px/lg) group padding, `py-2` (8px/sm) row padding, `gap-8` (32px/2xl) between groups, `mt-6` (24px/xl) button margin — all four values match the spacing table exactly. |
| 6. Experience Design | 3/4 | Loading/saved/collision states all covered and wired correctly; the overflow "backstop" state the spec explicitly flagged for build-time verification (long-text values) was verified live and fails. |

**Overall: 20/24**

---

## Top 3 Priority Fixes

1. **Long field values overflow the card and viewport instead of wrapping** — `src/components/dashboard/profile-tab.tsx:161-178` (`CategoryGroup`'s row markup). A field value of realistic length (a full CV/resume URL, a long GitHub PAT-style link — exactly the scenario UI-SPEC names as the reason line-clamp is deliberately *not* used here) breaks out of the `rounded-lg border` card, overflows the row, and pushes the page into horizontal scroll. Confirmed live: seeding a profile field with an unbroken ~250-character URL renders text spilling past the card border and off the right edge of a 1440px viewport. Root cause: the value's flex container (`<div className="flex items-center gap-2">`) never gets `min-w-0`/`flex-1`, so a flex child won't shrink below its content's intrinsic width, and the value `<span>` has `whitespace-normal` but no `break-words`/`overflow-wrap-anywhere`, so a spaceless string never finds a wrap point. Fix: add `min-w-0 flex-1` to the value wrapper and `break-words` (or `[overflow-wrap:anywhere]`) to the value `<span>` so unbroken tokens wrap mid-string instead of overflowing.
2. **Row label/value text doesn't carry the declared Body (15px) size token** — `src/components/dashboard/profile-tab.tsx:170,172` (`<span className="text-foreground">{row.label}</span>` and the value span). Neither span has `text-base`, so they render at the un-styled browser default rather than the spec's 15px/400/-0.01em Body role used everywhere else in the app (table cells, etc.). Minor visually but a real deviation from the Typography contract and inconsistent with the rest of the shipped UI. Fix: add `text-base` (mapped to `0.9375rem` in this project's `globals.css`) to both spans.
3. **Popover form labels use 12px (`text-xs`) instead of the Typography table's declared 13px Label token** — `src/components/dashboard/profile-tab.tsx:245,264,277,405,532`. UI-SPEC's Interaction Pattern section instructs matching `NotesPopover`'s exact class list (`text-xs font-medium text-muted-foreground`), but the same document's Typography table declares popover form `<label>`s as the 13px/500 Label role, which in this codebase's remapped scale is `text-sm`, not `text-xs` (`text-xs` = 12px here, not the DESIGN.md-inherited default). This is a self-contradiction inside the design contract itself rather than a pure implementation error — the executor followed the more explicit "match NotesPopover verbatim" instruction — but it does mean these 5 labels render 1px smaller than the Typography table promises. Flag for the next UI-SPEC revision to reconcile the two instructions; if `NotesPopover` itself is intended to move to `text-sm`, that's a cross-cutting change outside Phase 5's scope.

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)
- Empty-state heading `"Tu perfil está vacío"` and body copy match the Copywriting Contract character-for-character (`profile-tab.tsx:67-71`).
- `"Cargar datos básicos"` / `"+ Agregar campo"` button labels match exactly (`profile-tab.tsx:238-240,523-525`).
- Save-state text row (`"Guardando…"` / `"Guardado"` / non-breaking space, `aria-live="polite"`) replicated identically across all three popovers (`EditFieldPopover`, `AddFieldPopover`, `BulkLoadPopover`).
- The 3 new status labels — `"Auto-fill en curso"`, `"Listo para revisar"`, `"Enviado (auto-apply)"` — match the contract exactly in `status-dropdown.tsx:65-67`, including the deliberate `"(auto-apply)"` suffix that disambiguates from `"Aplicado"`.
- No generic `"Submit"/"OK"/"Cancel"` labels found in either audited file; `"Guardar"` is used consistently as the deliberate, non-generic save-action label across all three popover forms.
- One extra string not in the contract table — the collision-overwrite warning (`"'{label}' usa la misma clave interna que...'"`) — is an implementation addition beyond spec scope (handles a real data-integrity edge case: non-injective `normalizeToKey`), not a contract violation; it correctly uses icon+text per the Never-Color-Alone Rule.

### Pillar 2: Visuals (2/4)
- Screenshot evidence (`.planning/ui-reviews/05-20260908-162037/perfil-overflow-test.png`): a profile field with a long unbroken value renders the value text spilling past the card's right border and off the edge of the viewport, breaking the card's visual containment and, in a real page, forcing page-level horizontal scroll. This is the exact "overflow" UI Consideration the UI-SPEC marks `✅ covered` ("Value text wraps normally, no line-clamp/truncation") — it is not covered; it's broken.
- Trailing edit-trigger icon buttons are always visible (not hover-only), each with a correct `aria-label="Editar {label}"` (`profile-tab.tsx:392`) — good icon-button accessibility per the audit checklist.
- Clear visual hierarchy: category-group headers (muted, smaller) vs. row label/value (primary ink) vs. the outline "+ Agregar campo" affordance — matches the "settings-style list" intent.
- Populated-state screenshot (`perfil-populated.png`) otherwise renders cleanly: hairline-divided rows, no zebra striping, flat card surfaces, consistent with DESIGN.md's Flat-By-Default Rule.

### Pillar 3: Color (4/4)
- `src/app/globals.css:99-100` confirms `--accent: #1e1930` / `--accent-foreground: #e7e5e1` — exactly `violet-tint-surface`/`warm-off-white` per the palette, and `StatusDropdown`'s `isAutoStatus && "bg-accent text-accent-foreground"` (`status-dropdown.tsx:158`) reuses this token rather than introducing a raw `#7c6cf6` fourth use — correctly resolves the One Accent Rule tension the UI-SPEC calls out.
- `status-pill.tsx` is confirmed untouched by this phase, matching the explicit "untouched" instruction.
- `"Cargar datos básicos"` uses `Button variant="default"`, the one sanctioned primary-CTA use of Signal Violet (screenshot confirms a solid violet fill button, distinct from the outline "+ Agregar campo").
- No hardcoded hex/rgb colors found in `profile-tab.tsx` — all color comes through Tailwind/shadcn semantic tokens (`text-foreground`, `text-muted-foreground`, `border-border`, `bg-card`), which is the correct pattern for this codebase.

### Pillar 4: Typography (3/4)
- Category-group header (`profile-tab.tsx:158-160`, `text-sm font-medium text-muted-foreground`) correctly resolves to 13px/500 given this project's remapped `--text-sm: 0.8125rem` (`globals.css:69`) — matches the Label role exactly.
- Row `label`/`value` spans (`profile-tab.tsx:170,172`) carry no explicit `text-*` class and no ancestor sets one either — they fall back to the browser default font size rather than the declared 15px/400/-0.01em Body role that every other piece of running text in this app uses. Visually subtle (default browser size ≈16px vs. spec's 15px) but a real, checkable deviation.
- Popover form `<label>`s across all three popovers use `text-xs` (12px in this remapped scale) rather than the Typography table's declared 13px Label role for "popover form `<label>`s" — see Priority Fix #3 for the root-cause note (a contradiction between two UI-SPEC instructions, not a pure implementation slip).
- No new font weight introduced beyond the locked 400/500/600 scale; no 6th font size introduced.

### Pillar 5: Spacing (4/4)
- Category-group container: `rounded-lg border ... p-4` (`profile-tab.tsx:157`) = 16px = `lg`, matching "Category-group internal padding" exactly.
- Field rows: `py-2` (`profile-tab.tsx:166`) = 8px = `sm`, matching "field-row vertical padding" exactly.
- Group-to-group stacking: `flex flex-col gap-8` (`profile-tab.tsx:83`) = 32px = `2xl`, matching "vertical gap between stacked category groups" exactly.
- "+ Agregar campo" separation: `mt-6` (`profile-tab.tsx:88`) = 24px = `xl`, matching "margin between the last category group and the button" exactly.
- No arbitrary/bracket spacing values (`[Npx]`) found anywhere in `profile-tab.tsx`.

### Pillar 6: Experience Design (3/4)
- Loading state: `"Guardando…"` with `aria-live="polite"` verified live in all three popovers (edit, add-field, bulk-load).
- Save-complete state: `"Guardado"` verified live after a successful bulk-load save.
- Error state: matches `NotesPopover`'s console-only silent-revert convention — `EditFieldPopover` explicitly reverts `value` to `field.value` and `saveState` to `"idle"` on both a rejected write and a thrown exception (`profile-tab.tsx:366-380`), correctly covering the case the spec flagged as needing build-time verification.
- Collision handling (WR-01/CR-01 from a prior review pass, referenced in code comments) is a genuine extra: a visible `role="alert"` icon+text warning when a normalized-key collision silently overwrites an existing row — exceeds the spec's baseline "no visible error banner" convention in a good way, without contradicting it (it's a data-integrity notice, not a write-failure error).
- The `long-text`/`overflow` backstop states the UI-SPEC explicitly asked to "verify visually" were tested live and the overflow case fails (see Pillar 2) — this is the reason the score isn't a 4; the spec's own verification instruction caught a real gap that wasn't actually closed before this audit.
- `StatusDropdown`'s zero-one-many case (auto status as a non-selectable current value) verified correct in code: `SelectValue` renders `STATUS_META[status]` directly regardless of `SelectContent`'s `MANUALLY_SELECTABLE_STATUSES` list, and the trigger remains enabled/interactive even when `status` is an auto value — no structural risk, matches spec.
- Icon-collision check (Hourglass/Eye/CircleCheck vs. the 6 existing statuses' Bookmark/CircleDashed/Send/Clock/XCircle/CheckCircle2) verified correct in `status-dropdown.tsx:4-15,49-68` — no lucide import collisions.

---

## Files Audited
- `.planning/phases/05-perfil-y-etapas-de-tracking/05-UI-SPEC.md`
- `.planning/phases/05-perfil-y-etapas-de-tracking/05-CONTEXT.md`
- `DESIGN.md`
- `src/components/dashboard/profile-tab.tsx`
- `src/components/dashboard/status-dropdown.tsx`
- `src/components/dashboard/status-pill.tsx`
- `src/app/globals.css` (token verification: `--accent`, `--text-*` scale)
- `src/lib/application-status.ts` (`APPLICATION_STATUSES`/`MANUALLY_SELECTABLE_STATUSES` cross-check)
- Live rendered UI via local dev server (`localhost:3001`): Perfil tab empty state, populated state (desktop 1440x900 and mobile 375x812), edit-field popover, add-field popover, and a live overflow reproduction with a long field value.

Screenshots stored at `.planning/ui-reviews/05-20260908-162037/` (gitignored, not committed).
