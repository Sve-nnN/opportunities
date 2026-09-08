# Feature Research

**Domain:** AI-agent-assisted job application auto-fill with human-in-the-loop review (v1.1 "Auto-apply asistido con IA")
**Researched:** 2026-09-08
**Confidence:** MEDIUM (pattern-level findings cross-corroborated across multiple independent sources; no single authoritative spec exists for this exact "copy-prompt to external coding agent, callback via secret API" architecture because it is not yet a named, standardized category — see Gaps)

## Feature Landscape

### Table Stakes (Users Expect These)

These are the baseline behaviors any "AI fills the form, human confirms" tool needs. Missing any of these makes the feature feel unsafe or half-built, given Juan's explicit human-in-the-loop requirement.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Growing candidate profile (key-value, not fixed schema) | Every autofill tool (Simplify Copilot, Careerflow, JobWizard) starts from an uploaded/entered profile and gets more accurate as it fills in; a fixed-column schema breaks the first time a new ATS asks something the schema didn't anticipate ("Are you authorized to work without sponsorship?", "Why this company?"). | MEDIUM | Model as `profile_fields(key, value, label, category, updated_at)` — jsonb or a narrow EAV table, not a wide `profile` table with one column per known question. Matches the "grows per-field" requirement directly. |
| Self-contained generated prompt (all context inline, zero extra lookups) | The "copy prompt" hand-off pattern only works when the copied text is self-sufficient — AWS Step Functions' "Copy agent prompt" and shadcn space's "Copy Prompt" both embed everything the agent needs so it can start acting immediately rather than asking the human to go fetch more context. | LOW–MEDIUM | Prompt must inline: opportunity URL + title/company, full current profile snapshot, the callback endpoint URL + how to auth (not the secret value itself if pasted prompts might be logged — see Anti-Features), and explicit "ask Juan for anything you don't have, show the filled form before submitting" instruction. |
| Explicit "review before submit" checkpoint (draft-mode pattern) | Standard human-in-the-loop UX: agent stages the action, human approves the exact state before it becomes irreversible. Multiple sources converge on this as the correct pattern whenever an action is hard to reverse, contacts a third party, or has real-world consequences — a job submission hits all three. | LOW (behavioral/prompt-level, not app-level) | This lives mostly in the prompt instructions to the Claude Code session, not in the Opportunities Hub UI itself — but the app-side dependency is the intermediate status ("ready to review") that reflects it happened. |
| Per-application audit trail of what was actually sent to that specific site | Generic AI-agent audit-trail guidance is explicit that logs should be scoped to the individual action/session, not just a global mutation log — otherwise Juan can't answer "what exactly did I tell Greenhouse vs. what I told Workday" months later when a recruiter follows up. | MEDIUM | New table keyed by `application_id` (or `opportunity_external_id`), not a diff against the global profile alone — store the field-value pairs submitted for that specific application, plus timestamp and which profile fields were newly learned during that session. |
| Intermediate pipeline stages beyond terminal statuses | ATS/recruiting pipeline research confirms stage sets are always org/tool-specific, not a fixed universal enum — validates freely extending Juan's existing 6 statuses rather than needing to match some "industry standard" set. What's non-negotiable is that *some* stage exists to represent "agent session started but not yet confirmed," otherwise a half-finished auto-apply looks identical to "not started" or silently corrupts a real status. | LOW | `applications.status` is already a free-text column (see `src/db/schema.ts`), not a Postgres enum type — extending the allowed value set is an app-layer/Zod change, not a migration. Suggested additions: `auto_fill_in_progress`, `ready_to_review`, `submitted` (distinct from Juan manually marking `aplicado`, which stays for non-AI-assisted applications). |
| Secret-gated write endpoint for the callback | This is the mechanical backbone of the whole feature — without it the Claude Code session has no way to report back, and an unauthenticated endpoint would let any script mutate Juan's tracked application state. | LOW | Bearer-secret middleware Juan already has the stack for (Next.js Route Handler + env secret compare); this is not novel, just necessary. |

### Differentiators (Competitive Advantage)

These are specific to Juan's "reuse Claude Code as the automation engine" approach rather than building/buying a browser-automation product — this is where the design choices genuinely diverge from what commercial autofill tools do.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| No persistent session-driving bot — automation runs as a one-off external agent session per application | Commercial tools that puppet a logged-in LinkedIn/ATS session risk account suspension (LinkedIn detects automated activity: temporary 24-72h blocks/CAPTCHA escalating to permanent bans on repeat violations; ~30 Easy Apply/day is considered the informal safe ceiling). A short-lived Claude Code + Scrapling session per apply, initiated manually by Juan, structurally avoids the "always-on automation" pattern that triggers detection. | — (architectural decision, not a feature to build) | Already captured as a Key Decision in PROJECT.md; research corroborates it's the right call, not just a preference. Worth stating explicitly in the roadmap as the reason no in-app browser-automation engine is being built. |
| Field-level provenance instead of global-only profile log | Most consumer autofill tools (Simplify, Careerflow) only show you the profile and a job tracker entry — they don't surface "these 4 fields came from your resume, these 2 you typed fresh, this 1 was inferred" per application. A structured per-application audit trail (see Table Stakes) that also tags *which fields were newly learned this session* turns the growing profile into a reviewable, correctable asset instead of a black box. | MEDIUM | This is the same underlying table as the audit-trail table stake, but the differentiator is exposing it in the UI (e.g., an expandable "what was sent" panel per application) rather than just storing it. |
| Profile-completeness signal driving what the agent asks for | Because the profile starts minimal and grows organically, the app can show "your profile currently answers ~N known question types" and the agent-facing prompt can explicitly say "ask only for what's missing" — this is a natural extension of the flexible key-value model and differentiates from static-form onboarding flows competitors force upfront. | LOW (mostly a query over existing profile_fields + a documented list of "known question categories") | Nice-to-have polish, not core to v1.1 — flag for v1.2. |

### Anti-Features (Commonly Requested, Often Problematic)

Explicitly flagged per Juan's stated constraints and the risk research above.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| Full auto-submit without human review | Seems like the "real" automation — why stop one click short? | Every human-in-the-loop source converges on requiring approval for actions that are hard to reverse, contact third parties, or carry compliance/legal risk — an unreviewed job submission with a wrong or hallucinated answer (visa status, salary expectation, an essay question) is exactly that, and it's also explicitly out of scope per Juan's own decision reversal in PROJECT.md. | The mandatory "show filled form, get OK, then callback" flow already scoped — do not weaken it even for "trusted" or repeat sites. |
| Session-driving browser extension/bot that logs into ATS/LinkedIn on Juan's behalf persistently | Would feel more "automatic" and require less manual initiation per application. | This is the exact pattern that gets accounts rate-limited or banned (LinkedIn's automated-activity detection); it also reintroduces the "browser-automation engine to maintain against dozens of ATS variants" problem the current architecture explicitly avoids per PROJECT.md Key Decisions. | Keep automation scoped to one-off, human-initiated Claude Code + Scrapling sessions, never a standing logged-in automation loop. |
| Storing sensitive profile data (SSN-adjacent fields, salary history, visa/immigration details, financial info some ATS ask for) as plaintext in the same flexible key-value table with no access control beyond the app's normal auth | The flexible profile model makes it tempting to just store *everything* a form ever asks the same way. | This is a single-user personal tool with no auth layer beyond the bearer secret for the write endpoint — a leaked secret or DB dump would expose everything in one flat shape; some fields (SSN, DOB, financial) carry real identity-theft risk if leaked, unlike "years of experience" or "GitHub URL." | At minimum: flag sensitive profile keys with a `sensitive: boolean` column and exclude them from what's echoed back into generated prompts by default (require an explicit per-use include); consider whether truly high-risk fields (SSN) should be entered manually per-application by Juan rather than ever persisted at all — this is worth a one-line decision in the roadmap, not deep infra. |
| A single global "what data have I ever shared" log instead of the per-application table | Feels simpler to build — one profile, one audit log. | Loses exactly the thing Juan asked for: "what did I send to *this* site," which matters because different ATS/companies got different snapshots of the profile at different points in time as it grew. A global log can't answer that after the profile has since changed. | Per-application audit table keyed to `applications`/`opportunity_external_id`, as scoped in Table Stakes — this was already correctly identified in PROJECT.md, just reinforcing it against simplification pressure during implementation. |
| Rigid, ATS-borrowed pipeline-stage taxonomy (e.g. copying Greenhouse's exact stage names) | Feels like adopting a "standard." | Research confirms there is no universal stage standard across ATS/recruiting tools — every platform defines its own, so borrowing one arbitrarily adds vocabulary Juan didn't ask for without adding real structure. | Extend the existing free-text status set with the 2-3 stages Juan actually needs to see (`auto_fill_in_progress`, `ready_to_review`, `submitted`), keep it minimal, and treat it as app-specific vocabulary rather than trying to mirror an external system. |

## Feature Dependencies

```
[Growing candidate profile (key-value store)]
    └──requires──> [profile_fields table] (new)

[Send to AI button / prompt generation]
    └──requires──> [Growing candidate profile] (to snapshot into the prompt)
    └──requires──> [applications table] (Phase 3, existing — opportunity_external_id)
    └──requires──> [Intermediate pipeline stages] (to set "auto_fill_in_progress" when triggered)

[Secret-gated callback endpoint]
    └──requires──> [applications table] (Phase 3, existing — status/notes update target)
    └──requires──> [Growing candidate profile] (writes newly-learned fields back)
    └──requires──> [Per-application audit trail] (writes what-was-sent record)
    └──requires──> [Intermediate pipeline stages] (sets "ready_to_review" / "submitted")

[Per-application audit trail]
    └──requires──> [applications table] (Phase 3, existing — FK by opportunity_external_id, same
                     anti-pattern-2 convention: never the serial id)

[Intermediate pipeline stages]
    └──requires──> [applications.status column] (Phase 3, existing — already free text, no schema
                     migration needed to add values, only app-layer/Zod enum extension)

[Profile-completeness signal] ──enhances──> [Send to AI button / prompt generation]

[Full auto-submit] ──conflicts──> [Human-in-the-loop review requirement] (explicitly out of scope)
[Session-driving persistent bot] ──conflicts──> [No-standing-automation architecture decision]
```

### Dependency Notes

- **Send to AI button requires the growing profile and the existing `applications` table:** the prompt is only useful if it can snapshot current profile state and knows the opportunity's `url`/`opportunity_external_id` — both already exist from Phase 1–3, so this is additive, not a rework.
- **Callback endpoint requires the audit trail and pipeline stages to exist first (or land together):** an endpoint that only updates `status`/`notes` without also writing the per-application "what was sent" record silently drops the audit-trail requirement — build the write path and the audit write in the same unit of work, not as a follow-up.
- **Intermediate pipeline stages require no DB migration:** `applications.status` is already `text` with an app-defined default, not a Postgres enum type (confirmed in `src/db/schema.ts`) — this de-risks the "add new stages" requirement to a validation/UI change only.
- **Profile-completeness signal enhances but does not block the button:** it's a nice-to-have layered on top of the same `profile_fields` table, safe to defer to v1.2 without blocking the core loop.
- **Full auto-submit and session-driving bots conflict with the human-in-the-loop and one-off-session architecture decisions already locked in PROJECT.md:** listed here as explicit non-goals so they don't creep back in during implementation under the guise of "just an option."

## MVP Definition

### Launch With (v1.1)

Minimum viable version of the feature set already scoped as "Active" in PROJECT.md — nothing here should be cut further without renegotiating the milestone goal.

- [ ] `profile_fields` key-value table + minimal seed (name, contact, resume basics) — the growing profile has to exist before anything else works
- [ ] "Send to AI" button per opportunity that generates/copies a self-contained prompt (link + profile snapshot + callback instructions + explicit human-review instruction)
- [ ] Two-three new intermediate `applications.status` values (`auto_fill_in_progress`, `ready_to_review`, `submitted`) wired into the existing status UI
- [ ] Secret-gated (bearer) API endpoint for the callback session to update status/notes/profile
- [ ] Per-application audit table recording exactly what was sent to that specific site, written by the same callback

### Add After Validation (v1.2)

Add once the core loop has been used for real applications and Juan has felt where it's rough.

- [ ] UI panel to expand/inspect "what was sent" per application (surfacing the audit table, not just storing it)
- [ ] Profile-completeness indicator ("answers ~N known question types") to guide what the agent should ask about
- [ ] Sensitive-field flagging (`sensitive: boolean` on `profile_fields`) with default-excluded-from-prompt behavior — trigger: the first time a form asks for something Juan doesn't want echoed into a copy-pasted prompt
- [ ] "Stuck session" view — a filter/badge for applications sitting in `auto_fill_in_progress` past some threshold, so half-finished sessions are visible, not just theoretically trackable

### Future Consideration (v2+)

- [ ] Prompt template versioning (track which prompt version produced which application, useful once the prompt has iterated a few times) — defer until the prompt has actually changed more than once
- [ ] Encryption-at-rest / secrets-manager handling for genuinely sensitive profile fields (SSN-adjacent, financial) if Juan decides to persist them at all — defer until a concrete form actually demands one, don't build speculative crypto infra
- [ ] Notifications when a session appears abandoned — defer to the "alerts" v2 bucket already scoped as out-of-scope-for-now in PROJECT.md, don't build a bespoke notifier just for this feature

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Growing candidate profile (key-value) | HIGH | MEDIUM | P1 |
| Send to AI prompt generation | HIGH | LOW–MEDIUM | P1 |
| Intermediate pipeline stages | HIGH | LOW | P1 |
| Secret-gated callback endpoint | HIGH | LOW | P1 |
| Per-application audit trail (storage) | HIGH | MEDIUM | P1 |
| Per-application audit trail (UI panel) | MEDIUM | LOW | P2 |
| Profile-completeness signal | MEDIUM | LOW | P2 |
| Sensitive-field flagging | MEDIUM | LOW | P2 |
| Stuck-session view | MEDIUM | LOW | P2 |
| Prompt template versioning | LOW | LOW | P3 |
| Encryption-at-rest for sensitive fields | LOW (until a real field demands it) | HIGH | P3 |
| Abandoned-session notifications | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for v1.1 launch (matches PROJECT.md "Active" requirements exactly)
- P2: Should have, add in v1.2 once the core loop is validated with real applications
- P3: Nice to have, defer to v2+ or until a concrete trigger justifies it

## Competitor Feature Analysis

"Competitors" here are commercial autofill tools, not other personal dashboards — useful as a contrast set to sharpen what's actually different about Juan's approach.

| Feature | Simplify Copilot / Careerflow / JobWizard (commercial) | Juan's v1.1 approach | Notes |
|---------|--------------------------------------------------------|------------------------|-------|
| Autofill mechanism | Chrome extension detects and fills forms in-browser, live, against 100+ ATS templates the vendor maintains | External Claude Code session driven by a copy-pasted prompt, using Scrapling as its own tool | Avoids Juan having to build/maintain a per-ATS field-mapping engine; trades "instant in-browser fill" for "one manual copy-paste to kick off a session," which is an acceptable cost for a single-user tool. |
| Review before submit | User reviews flagged/unmapped fields, then clicks submit themselves inside the same browser tab | Claude Code session shows Juan the filled form and asks for explicit OK before it submits, then reports back via API | Functionally equivalent human-in-the-loop guarantee, different mechanism (agent-mediated confirmation vs. in-browser review) — matches Juan's explicit "no auto-submit" requirement either way. |
| Profile storage | Fixed-ish profile schema (resume fields) plus manual free-text answers per recurring question, vendor-hosted | Fully flexible key-value store, self-hosted in Juan's own Postgres | More flexible for unusual questions, but nothing pre-populates it — profile genuinely starts empty apart from basics, by design. |
| Audit trail | Job tracker logs that an application happened; no source found describing field-level "what was sent" per application as a user-facing feature | Structured per-application audit table + planned UI panel | This is the clearest actual differentiator found in research — commercial tools optimize for volume/speed, not for a detailed personal record of what was disclosed where. |
| Automation risk profile | Some tools (LazyApply-style "auto-apply") drive live sessions against sites like LinkedIn and carry account-suspension risk at high volume | One-off external agent session per application, no persistent logged-in automation | Structurally lower-risk by design, not because of careful rate-limiting — there is no standing bot to rate-limit. |

## Sources

- [Careerflow Autofill](https://www.careerflow.ai/autofill), [Simplify Copilot – Chrome Web Store](https://chromewebstore.google.com/detail/simplify-copilot-autofill/pbanhockgagggenencehbnadejlgchfc), [JobWizard – Chrome Web Store](https://chromewebstore.google.com/detail/jobwizard-ai-autofill-for/kbhgdbfkbgkokgkkdhnnlmkhnokjmfib) — LOW confidence (vendor/marketing pages), used only for mechanism description, cross-checked across 3+ independent tools converging on the same flow.
- [Affinda — Build or buy resume parser](https://www.affinda.com/blog/ats-resume-reader/), [Senseloaf — What is Resume Parsing](https://www.senseloaf.ai/blog-articles/what-is-resume-parsing) — LOW confidence (vendor blogs), used for typical candidate-profile field schema.
- [AI UX Playground — Human-in-the-loop pattern](https://aiuxplayground.com/pattern/human-in-the-loop/), [Agno — HITL controls for production agents](https://www.agno.com/blog/how-to-add-human-in-the-loop-controls-to-ai-agents-that-actually-run-in-production), [Agentic Patterns — Human-in-the-Loop Approval Framework](https://www.agentic-patterns.com/patterns/human-in-loop-approval-framework/) — LOW confidence individually (independent blogs/pattern catalogs, not a formal standard), but MEDIUM-equivalent given 3+ independently-run sources converge on the same "show exact action + confirm/cancel, required when hard-to-reverse/contacts others/compliance risk" pattern.
- [ARMO — Minimum Viable Audit Trail for AI agents](https://www.armosec.io/blog/minimum-viable-audit-trail/), [IETF draft-sharif-agent-audit-trail-00](https://datatracker.ietf.org/doc/draft-sharif-agent-audit-trail/), [Collibra — AI audit trails](https://www.collibra.com/blog/ai-audit-trails-what-to-log-for-models-and-agents-and-how-a-command-center-captures-it) — LOW-MEDIUM confidence (one is an active IETF draft, not yet a ratified standard; blogs corroborate the same shape), used for audit-trail field list and the "avoid raw PII in logs" caution applied to the sensitive-field anti-feature.
- [Mokahr — Managing candidate pipelines](https://www.mokahr.io/myblog/managing-candidate-pipelines-with-ats/), [Gem — What is an ATS](https://www.gem.com/blog/applicant-tracking-system) — LOW confidence, used only to confirm "no universal stage taxonomy" claim, not for specific stage names.
- [aiuxplayground.com — Human Handoff pattern](https://www.aiuxplayground.com/pattern/human-handoff/) — LOW confidence; this pattern is about AI-to-human support handoff, not human-to-agent prompt copy-paste — noted as a partial match, used only for the general "preserve context, state the trigger, don't drop the user cold" principles applicable to prompt structuring.
- [AWS — Set up your AI coding agent with a "Copy agent prompt" button](https://aws.amazon.com/blogs/compute/set-up-your-ai-coding-agent-to-build-with-aws-step-functions/), shadcn space "Copy Prompt" docs — LOW confidence (vendor blog/docs), the closest direct precedent found for the exact "web UI generates a self-contained prompt to paste into an external coding agent" pattern Juan is building.
- [loopcv.pro — Is it legal to automate job applications](https://www.loopcv.pro/guides/is-it-legal-to-automate-job-applications/), [connectsafely.ai — Is LinkedIn automation safe in 2026](https://connectsafely.ai/articles/is-linkedin-automation-safe-tos-scraping-guide-2026), [sprad.io — Auto-apply AI hype vs reality](https://sprad.io/blog/auto-apply-ai-for-jobs-hype-vs-reality-and-how-to-avoid-spammy-applications) — LOW confidence individually (SEO/marketing blogs), cross-checked across 3+ sources converging on "session-driving automation risks account suspension; major ATS don't auto-reject AI-assisted content" — used to validate the existing "one-off external agent, no persistent bot" architecture decision.
- `/Users/juan/Documents/Codigo/Personal/opportunities/src/db/schema.ts` — primary source (own codebase), confirms `applications.status` is free-text (no migration needed to add stages) and the `opportunity_external_id`-by-value FK convention new tables must follow.

## Gaps

- No source describes a system that does *exactly* what v1.1 scopes (web dashboard generates a prompt → external general-purpose coding agent fills a form → agent calls back a personal API to update tracking + grow a profile + log per-site disclosure). The closest precedents are split across three separate categories (commercial autofill extensions, generic "copy prompt to AI agent" dev-tool buttons, and AI-agent audit-trail guidance) and had to be synthesized rather than found as one pattern — treat the "Table Stakes" here as inferred-and-adapted, not observed-as-is elsewhere.
- Could not verify how commercial autofill tools handle genuinely sensitive fields (SSN, work authorization specifics, salary history) at a technical/storage level — the anti-feature guidance on that point is derived from general security reasoning, not a cited best-practice source, and is a good candidate for its own targeted lookup if it becomes a real blocker during v1.2.

---
*Feature research for: AI-assisted auto-fill with human-in-the-loop review (Opportunities Hub v1.1)*
*Researched: 2026-09-08*
