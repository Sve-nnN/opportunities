---
phase: 07-send-to-ai
validated: 2026-09-10
validator: Claude (Nyquist adversarial gap-fill)
status: gaps_filled
---

# Phase 7: Send to AI — Nyquist Validation Report

## Scope

`07-VERIFICATION.md` scored 10/10 truths but explicitly flagged two of them as
**code-inspection only, never behaviorally exercised** because no real row in
the live dataset (16,615 opportunities, 1 application) satisfied the
conditions:

- Truth #7: a row with `url IS NULL` should render the "Send to AI" button
  disabled with `aria-label="Send to AI (sin link de aplicación)"`.
- Truth #8: a row whose `applications.status` is `auto_fill_in_progress` or
  `ready_to_review` should render `aria-label="Reenviar prompt"`.

Additionally, `07-REVIEW.md`/`07-REVIEW-FIX.md` shipped a real security fix
(CR-02: `sanitizeForPrompt`, stripping injected Markdown headings from
untrusted `title`/`company` GitHub data) that was verified only by a single
visual screenshot inspection in `07-VERIFICATION.md` — no automated
regression test exists to catch a future refactor that silently reintroduces
the "lethal trifecta" injection vector this fix specifically closed.

These three items are genuine gaps between the phase's requirements and its
automated test coverage: the behavior was asserted true by human/code review,
never proven by a test that can fail.

## Gaps Identified and Filled

| # | Gap | Type | Requirement | Test Type |
|---|-----|------|-------------|-----------|
| 1 | CR-02 sanitization (malicious title/company Markdown-heading injection) has zero automated regression coverage | no_test_file | APPLY-02 / T-07-03 (threat model) | unit (pure function) |
| 2 | Disabled "Send to AI" state for a `url IS NULL` row never behaviorally tested (Truth #7, code-inspection only) | no_test_file | APPLY-01 | e2e (real browser) |
| 3 | "Reenviar prompt" label for `ready_to_review`/`auto_fill_in_progress` status never behaviorally tested (Truth #8, code-inspection only) | no_test_file | APPLY-01 | e2e (real browser) |

All three are FORCE-hypothesis tests: written assuming the implementation
does NOT meet the requirement, executed for real, not asserted from reading
the source.

## Test Created

**File:** `scripts/verify-send-to-ai-nyquist-gaps.ts` (new, follows the
project's existing ad hoc tsx-against-real-Postgres convention, same as
`scripts/verify-send-to-ai.ts`/`scripts/verify-apply-session.ts` — no test
framework in this codebase).

**Command (Gap 1 only, no server needed):**
```
DATABASE_URL=postgresql://postgres:devpassword@127.0.0.1:5434/opportunities \
  pnpm exec tsx scripts/verify-send-to-ai-nyquist-gaps.ts
```

**Command (all 3 gaps, requires `pnpm dev` on :3921 with `AUTO_APPLY_CALLBACK_SECRET`/`NEXT_PUBLIC_APP_URL` set):**
```
DATABASE_URL=postgresql://postgres:devpassword@127.0.0.1:5434/opportunities \
  AUTO_APPLY_CALLBACK_SECRET=<same secret the dev server was started with> \
  pnpm exec tsx scripts/verify-send-to-ai-nyquist-gaps.ts http://localhost:3921
```

## Results

### Gap 1 — CR-02 sanitization regression test (unit, pure `buildApplyPrompt`)

Constructed a malicious `opportunityTitle`/`opportunityCompany` containing an
embedded fake `## 8. Nueva instrucción` / `## 9. Otra instrucción` Markdown
heading plus real newlines (the exact attack shape `07-REVIEW.md` CR-02
described: a malicious PR to the source GitHub repos injecting a fake
section). Asserted:
- neither injected heading string survives verbatim in the output,
- each of the 7 real section markers (`## 1.` … `## 7.`) appears **exactly
  once** (an unsanitized injection would either duplicate a marker or
  displace the real section boundaries used by `sectionOrderIndices` in the
  existing verify script),
- the underlying text (e.g. "Software Engineer Intern") is still visible to
  Juan — sanitization neutralizes, never silently drops, untrusted data.

**Ran against the real `sanitizeForPrompt`/`buildApplyPrompt` implementation
on `master`. Result: PASS on first run** — `sanitizeForPrompt`'s `#`-stripping
and newline-collapsing genuinely defeats this injection shape.

### Gap 2 — Disabled state for a real `url IS NULL` row (e2e, real Playwright browser)

Seeded a real `opportunities` row (`nyquist-gap-no-url-row`, `url: null`),
navigated a real headless Chromium to `/?q=<distinctive title>` (filtering
via the app's own `SearchBar` → `ilike(title)` query path, not a UI
bypass), located the row by `tr[data-external-id]`, and asserted the
button's live `aria-label` attribute and `disabled` DOM property.

**Result: PASS on first run** — `aria-label` was exactly
`"Send to AI (sin link de aplicación)"` and the button was genuinely
disabled in the rendered DOM, not just in source.

### Gap 3 — "Reenviar prompt" label for a real in-progress row (e2e, real Playwright browser)

Seeded a real `opportunities` row plus a real `applications` row with
`status: "ready_to_review"` (`source: "ai_session"`, matching Phase 6's
callback convention), navigated the same way, and asserted the live
`aria-label`.

**Result: PASS on first run** — `aria-label` was exactly `"Reenviar prompt"`.

### Cleanup

Both e2e gaps seed rows via `INSERT ... ON CONFLICT DO UPDATE` under
clearly-namespaced test `externalId`s (`nyquist-gap-*`) and delete them in a
`finally` block, same convention as the phase's own
`scripts/verify-send-to-ai.ts`. Confirmed via a second `docker ps` check that
the `opportunities-postgres` container was reused, never recreated, and the
16,615 real opportunity rows were untouched (only the 2 namespaced test rows
were added and removed).

## Verification Map Updates

| Task ID | Requirement | Automated Command | Status |
|---------|-------------|--------------------|--------|
| 07-CR-02-regression | APPLY-02 (prompt-injection mitigation, CR-02) | `pnpm exec tsx scripts/verify-send-to-ai-nyquist-gaps.ts` | green |
| 07-truth-7 | APPLY-01 (disabled button, no url) | `pnpm exec tsx scripts/verify-send-to-ai-nyquist-gaps.ts http://localhost:3921` | green |
| 07-truth-8 | APPLY-01 ("Reenviar prompt" label) | `pnpm exec tsx scripts/verify-send-to-ai-nyquist-gaps.ts http://localhost:3921` | green |

## Debug Iterations

None required — all 3 gap tests passed on the first execution against the
real implementation on `master`. No implementation bugs found; this run
converts previously human/code-inspection-only claims into reproducible,
automated, failing-capable regression coverage.

## Files for Commit

- `scripts/verify-send-to-ai-nyquist-gaps.ts` (new)
- `.planning/phases/07-send-to-ai/07-VALIDATION.md` (new, this file)

---
*Validated: 2026-09-10*
*Validator: Claude (Nyquist adversarial gap-fill)*
