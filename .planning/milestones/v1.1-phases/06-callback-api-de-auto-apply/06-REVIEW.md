---
phase: 06-callback-api-de-auto-apply
reviewed: 2026-09-08T22:25:53Z
depth: deep
files_reviewed: 6
files_reviewed_list:
  - src/app/api/applications/[externalId]/apply-session/route.ts
  - src/db/queries/application-history.ts
  - src/db/queries/opportunities.ts
  - src/db/queries/profile.ts
  - src/db/schema.ts
  - src/lib/application-status.ts
findings:
  critical: 1
  warning: 3
  info: 1
  total: 5
status: issues_found
---

# Phase 6: Code Review Report

**Reviewed:** 2026-09-08T22:25:53Z
**Depth:** deep
**Files Reviewed:** 6 (plus cross-referenced: `src/app/api/sync/route.ts`, `src/lib/profile-key.ts`, `src/db/client.ts`, `scripts/verify-apply-session.ts`, `drizzle/0003_magenta_impossible_man.sql`)
**Status:** issues_found

## Summary

The endpoint correctly uses a real `node-postgres`-backed `db.transaction()` (confirmed via `src/db/client.ts` — `pg.Pool` + `drizzle-orm/node-postgres`, not an HTTP-based driver that would silently no-op transactions), so a `CallbackValidationError` thrown mid-transaction genuinely rolls back all three writes (`applications`, `profile_fields`, `application_history`) together — this was independently verified end-to-end by `scripts/verify-apply-session.ts` case 7 and traced by hand here. Array size caps (`.max(50)` on both `sentFields` and `profileUpdates`), the 404 pre-check before any transaction opens, the `key`-never-from-client rule for `profileUpdates`, and the append-only migration (`application_history` has no UNIQUE on `opportunity_external_id`, matching schema.ts exactly) are all implemented as specified and match `06-CONTEXT.md`.

The one BLOCKER is real and central to this phase's own stated threat model: the "read current state, validate, then write" pattern inside `db.transaction()` reads `applications.status` and `profile_fields.label` via plain `SELECT` (no `FOR UPDATE`, no advisory lock, default `READ COMMITTED` isolation), so the forward-only state machine and the profile-collision guard can both be bypassed by two concurrent calls to the same `externalId` — exactly the "calling the endpoint twice concurrently" scenario this review was asked to check, and exactly the scenario the code's own comments claim is closed ("reads the status INSIDE the transaction... to avoid a race between the check and the write"). It is not closed; reading inside a transaction under `READ COMMITTED` provides no such guarantee without an explicit lock. This is untested by `scripts/verify-apply-session.ts`, which only exercises sequential calls.

The bearer-secret comparison is a plain `!==` string comparison (not `crypto.timingSafeEqual`), copied verbatim from the pre-existing `api/sync/route.ts` pattern — flagged as a WARNING since it mirrors an already-accepted precedent, but this endpoint's own threat model explicitly treats its caller as "semantically untrusted" more than `/api/sync`'s, so the same shortcut deserves re-examination here.

## Critical Issues

### CR-01: Forward-only transition and profile-collision checks are read-then-write races, not closed by "read inside the transaction"

**File:** `src/app/api/applications/[externalId]/apply-session/route.ts:129-187`
**Issue:**
Both safety checks this phase's threat model (T-06-02, T-06-03) relies on are implemented as a plain `SELECT` followed by a separate write statement, inside the same `db.transaction()` but with no row lock:

```ts
const [currentRow] = await tx
  .select({ status: applications.status })
  .from(applications)
  .where(eq(applications.opportunityExternalId, parsedExternalId.data));
const currentStatus = currentRow?.status ?? null;

if (!isForwardAutoApplyTransition(currentStatus, parsedBody.data.status)) {
  throw new CallbackValidationError(/* ... */);
}
// ...later, a separate statement:
await tx.insert(applications).values({...}).onConflictDoUpdate({...});
```

and, per `profileUpdates` entry, in `upsertProfileField` (`src/db/queries/profile.ts:87-107`):

```ts
const existing = await executor
  .select({ label: profileFields.label })
  .from(profileFields)
  .where(eq(profileFields.key, input.key));
const collided = existingLabel !== undefined && existingLabel !== input.label;
await executor.insert(profileFields).values(input).onConflictDoUpdate({...});
```

Postgres's default isolation level is `READ COMMITTED`, where each statement in a transaction sees the latest *committed* snapshot at the time that statement runs — a plain `SELECT` takes no row lock. Two concurrent `POST` calls to the same `externalId` can each read the same stale `currentStatus`/`existingLabel`, each independently pass their own forward/no-collision check, and then both proceed to write. Concrete exploit: application is at `submitted`. Request A (in flight) already committed a write earlier and moved status forward; Request B started slightly earlier, read `currentStatus = "ready_to_review"` (stale, pre-A), validates `nextStatus = "ready_to_review"` as forward/no-op (`nextIndex >= currentIndex` when equal), and commits — silently regressing `applications.status` from `submitted` back to `ready_to_review`, with `application_history` still correctly recording B's own reported status (so the audit log will show a call reporting `ready_to_review` sandwiched after one reporting `submitted`, but `applications.status` — what Juan's dashboard actually reads — regresses). The same TOCTOU applies to the profile-collision check: two concurrent `profileUpdates` entries for different-but-colliding labels can both read "no existing row" and both pass, with the loser's `onConflictDoUpdate` silently clobbering the winner's label — the exact CR-01 (05-REVIEW.md) failure mode this phase claims to close, reopened under concurrency.

This matters specifically because the phase's own threat model treats the caller as "the interpretation of an LLM of an arbitrary webpage," not a disciplined single-threaded client — nothing prevents that caller (or a retry-happy HTTP client, or a genuinely malicious actor who has obtained the bearer secret) from firing two overlapping requests.

**Fix:** Serialize per-`externalId` writes with a Postgres advisory transaction lock acquired first thing inside `db.transaction()`, before any read:

```ts
await db.transaction(async (tx) => {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${parsedExternalId.data}))`);

  const [currentRow] = await tx
    .select({ status: applications.status })
    .from(applications)
    .where(eq(applications.opportunityExternalId, parsedExternalId.data));
  // ...rest unchanged; now serialized per externalId, the lock is
  // automatically released at COMMIT/ROLLBACK.
});
```

For the profile-collision check, either extend the same advisory lock to also cover `input.key` (e.g. `pg_advisory_xact_lock(hashtext(externalId), hashtext(key))` isn't valid — use two separate `pg_advisory_xact_lock` calls or a combined hash), or accept that since `profileUpdates` entries are processed sequentially within the already-locked-per-`externalId` transaction, cross-request races on the *same* profile key are only fully closed if every apply-session call (across all `externalId`s) that touches `profile_fields` shares one lock scope — simplest correct fix is a second advisory lock keyed by a fixed constant (e.g. `pg_advisory_xact_lock(0)`) since `profile_fields` is a single shared table with no per-`externalId` partitioning. Alternatively, run the whole transaction at `SERIALIZABLE` isolation and retry once on a `40001` serialization-failure error code — more idiomatic Postgres, but requires adding retry logic the current code doesn't have.

## Warnings

### WR-01: Bearer-secret comparison is not constant-time

**File:** `src/app/api/applications/[externalId]/apply-session/route.ts:86-89`
**Issue:** `authHeader !== \`Bearer ${expectedSecret}\`` is a standard JS string inequality, which can short-circuit on the first differing byte — a textbook timing side-channel on a secret comparison. This mirrors the pre-existing pattern in `src/app/api/sync/route.ts:29-32`, so it's a repeated pattern rather than a novel mistake, but this phase's own threat model explicitly frames the caller as more adversarial ("no es Juan escribiendo un curl a mano... la interpretación de un LLM de una página web arbitraria") than `/api/sync`'s trigger, so the same shortcut carries more residual risk here. Network jitter makes this hard to exploit in practice, but it's a one-line fix with no downside.
**Fix:**
```ts
import { timingSafeEqual } from "node:crypto";

function safeCompareBearer(received: string | null, expected: string): boolean {
  const expectedHeader = `Bearer ${expected}`;
  const a = Buffer.from(received ?? "");
  const b = Buffer.from(expectedHeader);
  return a.length === b.length && timingSafeEqual(a, b);
}
// ...
if (!safeCompareBearer(authHeader, expectedSecret)) {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}
```

### WR-02: `normalizeToKey` can derive an empty-string profile key from a symbol-only label

**File:** `src/lib/profile-key.ts:13-19`, consumed at `src/app/api/applications/[externalId]/apply-session/route.ts:162`
**Issue:** `profileUpdateEntrySchema` only requires `label` to be non-empty after `.trim()` (`z.string().trim().min(1).max(200)`) — it does not validate the *derived* key. A label made entirely of characters outside `[a-z0-9]` after lowercasing (e.g. `"!!!"`, `"---"`, or an emoji-only string) normalizes to `""` (empty string) after `normalizeToKey`'s final `replace(/^_+|_+$/g, "")` strips all-underscore output down to nothing. This is reachable directly from the externally-callable endpoint's `profileUpdates[].label`, whereas in the pre-Phase-6 world only Juan's own manual "+ Agregar campo" form could reach this code path. The existing collision check still functions correctly for this edge case (two different symbol-only labels both mapping to `key: ""` would be caught as a collision, and a repeat of the exact same symbol-only label is treated as a same-label update), so this is not a bypass of CR-01 — but it lets an untrusted caller write a `profile_fields` row with a semantically meaningless empty `key`, which is confusing state to debug and could interact badly with any future code that assumes `key` is always a non-empty, human-derived slug.
**Fix:** Reject empty derived keys explicitly before calling `upsertProfileField`:
```ts
const key = normalizeToKey(entry.label);
if (key.length === 0) {
  throw new CallbackValidationError(
    `profileUpdates label "${entry.label}" does not normalize to a usable key`,
  );
}
```

### WR-03: `CallbackValidationError` doesn't set `this.name`

**File:** `src/app/api/applications/[externalId]/apply-session/route.ts:59`
**Issue:** `class CallbackValidationError extends Error {}` leaves `error.name` as the inherited `"Error"` instead of `"CallbackValidationError"`. The current code only ever discriminates via `error instanceof CallbackValidationError`, so this doesn't cause a functional bug today, but it degrades any future `console.error`/structured logging that prints `error.name` (they'd all read `"Error"`, indistinguishable from an unexpected infrastructure failure at a glance in logs).
**Fix:**
```ts
class CallbackValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CallbackValidationError";
  }
}
```

## Info

### IN-01: Collision error response discloses an existing profile field's label to the calling session

**File:** `src/app/api/applications/[externalId]/apply-session/route.ts:179-181`
**Issue:** On a profile-label collision, the 400 response body includes `existingLabel` — the label of a `profile_fields` row Juan already has saved, which the calling session did not necessarily submit itself:
```ts
throw new CallbackValidationError(
  `profileUpdates label "${entry.label}" collides with existing label "${existingLabel}" (both normalize to key "${key}")`,
);
```
Since the caller already needs a valid bearer secret to reach this code path at all, and that secret is meant to represent "a session Juan started" with legitimate write access to his profile, this is low severity — but it does mean a caller can enumerate existing profile field label names (not values) by probing `profileUpdates` with guessed labels and reading the error message, which is more read-capability than the endpoint's contract otherwise grants (there is no GET on this route). Worth a conscious decision rather than an incidental side effect.
**Fix:** If this disclosure is unintentional, return a generic message (`"profileUpdates label collides with an existing profile field"`) to the caller and log the specific `existingLabel`/`key` pair server-side via `console.error` instead, preserving debuggability without echoing Juan's existing profile data back through an externally-callable endpoint.

---

_Reviewed: 2026-09-08T22:25:53Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
