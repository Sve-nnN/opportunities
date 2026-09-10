# Phase 7 — UI Review

**Audited:** 2026-09-10
**Baseline:** `.planning/phases/07-send-to-ai/07-UI-SPEC.md` (design contract, approved-pending)
**Screenshots:** captured (dev server started against `opportunities-postgres`, port 3000, 1440x900) — table default, tooltip hover, `copying` transient, and the `clipboard_failed` fallback state (headless Chromium denies `navigator.clipboard.writeText()` by default, which is the expected browser behavior that exercises this exact fallback path — not an app bug). `config_error` and the per-row disabled state were verified via code only (env had `AUTO_APPLY_CALLBACK_SECRET` set for the capture session and no sampled row lacked a `url` in the visible 1–100 range).

Stored at: `.planning/ui-reviews/07-send-to-ai-20260910-130600/` (`table-default.png`, `tooltip-hover.png`, `popover-copying.png`, `popover-result.png`).

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 4/4 | All 5 copy strings (default/reenviar/disabled/copying/copied/clipboard-fail/config-error) match the spec's contract table verbatim, confirmed both in source and live render. |
| 2. Visuals | 4/4 | `Sparkles` icon is visually consistent with `StatusDropdown`/`NotesPopover` triggers (same `size-8` ghost button, same row baseline); tooltip renders correctly on hover. |
| 3. Color | 4/4 | Only `text-destructive` used (config_error), no new raw hex, no fourth use of Signal Violet introduced. |
| 4. Typography | 4/4 | Only `text-xs` used across all 4 popover states, matching the Small/Meta token; no stray size/weight. |
| 5. Spacing | 3/4 | `config_error` icon-to-text gap uses `gap-2` (8px) instead of the spec's explicitly declared `xs` token (6px / `gap-1.5`) for that exact element — see finding below. |
| 6. Experience Design | 4/4 | All 4 states implemented and functioning: `copying` (aria-live, disabled button), `clipboard_failed` (verified live, pre-selected textarea, `w-96`, `font-mono`), `config_error` (code-verified, `role="alert"`), disabled row (code-verified, folded-in `aria-label`). |

**Overall: 23/24**

---

## Top 3 Priority Fixes

1. **Spacing token mismatch in `config_error` row** — `send-to-ai-button.tsx:247` uses `gap-2` (8px) where 07-UI-SPEC.md's Spacing Scale table explicitly names this exact element ("Icon-to-text gap inside the `config_error` row") as the `xs` token (6px). Low user impact (2px is imperceptible), but it's a literal deviation from a spec line that exists specifically to lock this value — fix: change `gap-2` to `gap-1.5` on `send-to-ai-button.tsx:247`.
2. **`config_error` and disabled states unverified live** — the capture session had `AUTO_APPLY_CALLBACK_SECRET` set and no sampled row lacked `url`, so these 2 of 4 states were only code-reviewed, not rendered. Recommend a manual pass before shipping: unset the secret and click a button once, then find/force a `url: null` row and confirm the `Sparkles` icon dims (`opacity-50` via `Button`'s native disabled styling) and the tooltip reads "Send to AI (sin link de aplicación)".
3. **Popover fully occludes the "Ver fuente" link while open** — `align="start"` plus `w-80`/`w-96` means the open popover visually covers the Link column of the same row (confirmed in `popover-result.png`). This is expected/spec-compliant controlled-popover behavior (not a UI-SPEC violation — `NotesPopover` already behaves this way in production), but it's worth a conscious "leave as-is" note rather than an unnoticed side effect, since this phase widened the Postulación column and pushed the popover's anchor further right, closer to the Link column it now overlaps.

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)
- `send-to-ai-button.tsx:94-98` — `ariaLabel` logic produces exactly the 3 contracted strings ("Send to AI" / "Reenviar prompt" / "Send to AI (sin link de aplicación)"), in the correct precedence order (disabled check first).
- Popover body strings (`Copiando…`, `Prompt copiado`, the clipboard-failure sentence, `Falta configurar AUTO_APPLY_CALLBACK_SECRET`) match the Copywriting Contract table character-for-character — confirmed live for "Copiando…" and the clipboard-failure sentence (`popover-copying.png`, `popover-result.png`).
- No genericized fallback labels ("Submit"/"OK"/"Cancel") found in the audited file.

### Pillar 2: Visuals (4/4)
- Live capture (`table-default.png`) shows the `Sparkles` trigger sitting flush with `NotesPopover`'s document icon at identical `size-8`/`size-4` proportions — no visual imbalance in the row.
- Tooltip (`tooltip-hover.png`) renders above the trigger with correct copy ("Send to AI") and standard shadcn tooltip chrome (foreground bg, background text) — no custom override breaking contrast.
- Icon-only button is paired with both `aria-label` and a `Tooltip`, satisfying the icon+text pairing requirement structurally (no orphaned icon-only affordance).

### Pillar 3: Color (4/4)
- `grep` across `send-to-ai-button.tsx` found exactly one color-role class: `text-destructive` on the `config_error` row (`line 247`) — the single sanctioned destructive use per spec.
- No hex literals, no `text-primary`/`bg-primary`/violet class added anywhere in this file — the One Accent Rule (DESIGN.md) is not diluted by this phase.
- Focus ring is inherited from `Button`'s existing default styling (not overridden here), so no new/duplicate accent use was introduced.

### Pillar 4: Typography (4/4)
- Every text node inside the 4 popover states uses `text-xs` only (lines 223, 227, 232, 240, 247) — matches the Small/Meta (12px/400) token declared for this phase; no stray `text-sm`/`text-base` crept in.
- The fallback `Textarea` correctly combines `font-mono text-xs` (mono family at Small/Meta size, not the reserved Data-Mono 11px size) exactly as the spec's Typography table specifies.

### Pillar 5: Spacing (3/4)
- `size-8` trigger, `w-80`/`w-96` popover widths, and `rows={12}` textarea all match the spec's pre-existing-convention reuse (lines 184, 209, 239).
- **Deviation:** `gap-2` (line 247, `config_error` row) vs. spec's declared `xs` (6px) token for that specific icon-to-text gap. `gap-2` is Tailwind's 0.5rem/8px step, i.e. the spec's own `sm` token value, applied where `xs` was explicitly named. See Top 3 Fix #1.

### Pillar 6: Experience Design (4/4)
- Loading: `disabled={isPending}` combined with the `copying` popover text is implemented and observed live (`popover-copying.png` — button dimmed via native disabled styling, popover shows "Copiando…").
- Error (config path): `config_error` state code-verified — `TriangleAlert` + `role="alert"` + destructive text, matches spec; not observed live in this session (see Top 3 Fix #2).
- Error (clipboard path): observed live and correct — `clipboard_failed` state rendered with the exact contracted sentence, a `w-96` popover, and a `rows={12}` `font-mono text-xs` `readOnly` textarea (`popover-result.png`).
- Zero-one-many (`url` absent): code-verified disabled path (`disabled={!url || isPending}`), not observed live this session.
- The component also carries 3 defensive fixes beyond the literal UI-SPEC (documented inline as WR-01/WR-02/WR-03 in code comments): server-side re-validation of `url` before embedding the secret, an outer `try/catch` around the whole Server Action call so a thrown rejection doesn't strand the popover on "Copiando…" forever, and a deferred-focus-restore fix for Escape-during-`copying`. These are good-faith hardening beyond the contract, not spec deviations.

---

## Registry Safety

`components.json` present, no third-party registries declared in 07-UI-SPEC.md's Registry Safety table (all 4 blocks — popover, button, textarea, tooltip — are first-party shadcn official). Registry audit: 0 third-party blocks checked, no flags — audit skipped as not applicable.

---

## Files Audited

- `/Users/juan/Documents/Codigo/Personal/opportunities/src/components/dashboard/send-to-ai-button.tsx`
- `/Users/juan/Documents/Codigo/Personal/opportunities/src/components/dashboard/virtualized-opportunities-table.tsx`
- `/Users/juan/Documents/Codigo/Personal/opportunities/src/components/ui/tooltip.tsx`
- `/Users/juan/Documents/Codigo/Personal/opportunities/src/app/actions/auto-apply.ts` (Server Action, read for context on the `config_error`/disabled trust boundary)
- `/Users/juan/Documents/Codigo/Personal/opportunities/src/app/layout.tsx` (confirmed `TooltipProvider` wraps the app root — required for `Tooltip` to function)
- Live screenshots: `table-default.png`, `tooltip-hover.png`, `popover-copying.png`, `popover-result.png` (`.planning/ui-reviews/07-send-to-ai-20260910-130600/`)
