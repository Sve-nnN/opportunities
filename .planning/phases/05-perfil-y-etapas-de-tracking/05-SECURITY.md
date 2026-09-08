---
phase: 05-perfil-y-etapas-de-tracking
threats_open: 0
asvs_level: 1
---

# Phase 5: Security Audit — Perfil y Etapas de Tracking

**Verdict:** SECURED (0 blocking threats)
**Closed:** 3/4 | **Open (non-blocking):** 1/4

## Closed

| Threat ID | Category | Severity | Disposition | Evidence |
|-----------|----------|----------|--------------|----------|
| T-05-01 | Tampering | medium | mitigate | `key` is never client-supplied — `src/app/actions/profile.ts` `entrySchema` has no `key` field; `normalizeToKey(entry.label)` runs server-side (`src/lib/profile-key.ts:13-19`), confirmed the only call path. |
| T-05-02 | Tampering | low | mitigate | Drizzle typed builder only in `db/queries/profile.ts` and `db/queries/applications.ts` — zero raw SQL. |
| T-05-04 | Tampering | medium | mitigate | `statusSchema = z.enum(MANUALLY_SELECTABLE_STATUSES)` (6 values) rejects the 3 read-only auto-apply statuses server-side in `updateApplicationStatus`; `StatusDropdown`'s `SelectContent` never renders them as options. Single write path confirmed (no other route touches `applications.status`). |

## Open (non-blocking, below `high` threshold)

| Threat ID | Category | Severity | Disposition | Notes |
|-----------|----------|----------|--------------|-------|
| T-05-03 | Information Disclosure | low | **accept** | Profile data (name/email/phone/CV link/LinkedIn/GitHub — no financial/government-ID fields by design this phase) sits in the same single-tenant Postgres as everything else, reachable only via same-origin Server Actions, no new public API route. Accepted as adequate for a single-user self-hosted personal tool; revisit if/when genuinely sensitive fields (SSN, financial) are ever added (see REQUIREMENTS.md Out of Scope: encryption deferred until a concrete field demands it). |

## Informational (not a threat, flagged for defense-in-depth)

`saveProfileFields(entries)` in `src/app/actions/profile.ts` validates each entry but the outer array has no length cap — a same-origin client could submit an oversized batch causing a sequential-await delay. Low severity (single-user, no amplification), not blocking. Worth a `z.array(entrySchema).max(50)`-style cap if it ever becomes a real annoyance.

---
*Audited: 2026-09-08*
