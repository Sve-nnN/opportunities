---
phase: 06-callback-api-de-auto-apply
threats_open: 0
asvs_level: 1
---

# Phase 6: Security Audit — Callback API de Auto-apply

**Verdict:** SECURED (0 blocking threats)
**Closed:** 7/7

## Threat Verification

| Threat ID | Category | Severity | Disposition | Evidence |
|-----------|----------|----------|-------------|----------|
| T-06-01 | Spoofing | high | mitigate | Own secret `AUTO_APPLY_CALLBACK_SECRET` (distinct from `SYNC_TRIGGER_SECRET`), 500 if unset, `safeCompareBearer()` (`route.ts:76-81`, `timingSafeEqual`) checked before reading `params`/body. |
| T-06-02 | Tampering (status/transition) | high | mitigate | `z.enum(AUTO_APPLY_CALLBACK_STATUSES)` + `isForwardAutoApplyTransition`; `pg_advisory_xact_lock(hashtext(externalId))` acquired before reading `currentStatus` — closes the CR-01 TOCTOU race. |
| T-06-03 | Tampering (profile collision) | high | mitigate | `upsertProfileField` collision detection throws inside the tx; `pg_advisory_xact_lock(0)` serializes all this endpoint's transactions touching `profile_fields`, closing the cross-externalId race. |
| T-06-04 | Repudiation | medium | mitigate | `insertApplicationHistory` runs inside the same `db.transaction`; append-only table, indexed by `opportunity_external_id`. |
| T-06-05 | Tampering (resource) | low | mitigate | `z.array(...).max(50)` on both `profileUpdates` and `sentFields`. |
| T-06-06 | Tampering (nonexistent externalId) | low | mitigate | `opportunityExistsByExternalId()` checked before opening the transaction. |
| T-06-07 | Information Disclosure (fixed master secret handed off in a prompt) | high | **accept** | Documented in `06-CONTEXT.md` Deferred Ideas — short-lived per-application tokens evaluated and explicitly deferred past v1.1; compensating control: rotate via Dokploy env var if leak suspected. |

## Unregistered Flags (found during audit, already fixed)

- **New (previously unmapped) Information Disclosure**: the profile-collision error originally echoed `existingLabel` back to the caller — an endpoint that should only write was leaking read access to existing profile data. Confirmed already fixed (IN-01, `route.ts` no longer echoes it; server-side `console.error` only). Recommend folding into the threat registry as T-06-08 for future phases' reference.
- **Availability note (not a threat category originally scoped)**: `pg_advisory_xact_lock(0)` is a fixed global key — serializes ALL concurrent calls to this endpoint that touch `profile_fields`, regardless of `externalId`. No `statement_timeout` on the `pg.Pool`. Low real-world impact for a single-user personal tool (bounded work inside the lock window, `request.json()` resolved before the transaction opens), but worth knowing if this endpoint ever sees genuine concurrent traffic.
- **Scope note, not a new gap**: the fixed lock only protects this endpoint's own concurrent calls — Phase 5's manual `src/app/actions/profile.ts` path to `upsertProfileField` does not take the same lock. Pre-existing condition already documented in `05-SECURITY.md`/`05-REVIEW.md`, out of T-06-03's declared scope.

**threats_open:** 0

---
*Audited: 2026-09-08*
