/**
 * The 9 valid application-tracking states, occupying the same `status: text`
 * column defined in Phase 1's schema. Lives in its own module (no `pg`/`db`
 * import) specifically so client components (e.g. `StatusDropdown`) can
 * import this shape without pulling the Postgres driver into the browser
 * bundle — `db/queries/applications.ts` imports `@/db/client`, which
 * imports `pg`, which uses Node built-ins (`tls`, `util/types`) that don't
 * resolve client-side.
 *
 * `not_applied` is the DB column default, so an opportunity never tracked
 * yet always reads as "por aplicar," never null (03-01-PLAN.md must_haves:
 * "estado por defecto ... nunca null ni un error"). "saved" is a status
 * value like any other, not a separate isSaved-driven UI (TRACK-04).
 *
 * The 3 values after the original 6 (`auto_fill_in_progress`,
 * `ready_to_review`, `submitted`) are the Phase 5 (05-CONTEXT.md "Etapas
 * intermedias de tracking") read-only intermediate auto-apply states: they
 * are valid `status` column values and valid `StatusDropdown` display
 * states, but Juan never selects them by hand — only the Phase 6 callback
 * API sets them. `applications.status` stays the same free-text column, no
 * migration needed to accept them (research/ARCHITECTURE.md).
 */
export const APPLICATION_STATUSES = [
  "saved",
  "not_applied",
  "applied",
  "in_progress",
  "rejected",
  "accepted",
  "auto_fill_in_progress",
  "ready_to_review",
  "submitted",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/**
 * The 6 original statuses Juan can pick by hand from `StatusDropdown`'s
 * `SelectContent`. The 3 new auto-apply intermediate states (see
 * `APPLICATION_STATUSES` comment above) are deliberately excluded — they
 * render correctly via `STATUS_META` when already set on a row, but are
 * never offered as a selectable option (05-CONTEXT.md, 05-UI-SPEC.md
 * "Status Extension"). Also the server-side allowlist for
 * `updateApplicationStatus` (T-05-04 threat_model): a modified client
 * POSTing one of the 3 new values is rejected by Zod before it reaches
 * Postgres, defense in depth beyond the UI hiding them.
 */
export const MANUALLY_SELECTABLE_STATUSES = [
  "saved",
  "not_applied",
  "applied",
  "in_progress",
  "rejected",
  "accepted",
] as const;

/**
 * The exact complement of `MANUALLY_SELECTABLE_STATUSES` over
 * `APPLICATION_STATUSES` — the 3 auto-apply intermediate states, in
 * forward-progress order. This is the ONLY enum the Phase 6 callback route
 * (`POST /api/applications/[externalId]/apply-session`) accepts as an
 * input `status` value; the 6 manual statuses above remain the exclusive
 * domain of the `updateApplicationStatus` Server Action (06-CONTEXT.md:
 * "El endpoint solo acepta los 3 estados nuevos ... nunca los 6
 * manuales"). Order matters here — `isForwardAutoApplyTransition` below
 * uses each value's index in this tuple as its progress rank.
 */
export const AUTO_APPLY_CALLBACK_STATUSES = [
  "auto_fill_in_progress",
  "ready_to_review",
  "submitted",
] as const;

export type AutoApplyCallbackStatus = (typeof AUTO_APPLY_CALLBACK_STATUSES)[number];

/**
 * Simple monotonic state machine (06-CONTEXT.md: "Máquina de estados
 * simple que solo avanza"). Starting a brand-new auto-apply session — from
 * `null` (never tracked) or from any of the 6 manual statuses — is always
 * allowed, since that's not a regression of an in-progress auto-apply
 * flow, it's the start of one. Once `currentStatus` is itself one of the 3
 * auto-apply values, `nextStatus` may only stay put or advance
 * (`auto_fill_in_progress -> ready_to_review -> submitted`); moving to an
 * earlier index is rejected. Pure/standalone (no `pg`/`db` import, same
 * criterion as the rest of this module) so it's testable without touching
 * Postgres and safe to import from a client component if ever needed.
 */
export function isForwardAutoApplyTransition(
  currentStatus: string | null,
  nextStatus: AutoApplyCallbackStatus,
): boolean {
  const currentIndex = (AUTO_APPLY_CALLBACK_STATUSES as readonly string[]).indexOf(
    currentStatus ?? "",
  );
  if (currentIndex === -1) {
    // Not currently in one of the 3 auto-apply states (including `null`,
    // never tracked) — starting fresh always advances.
    return true;
  }
  const nextIndex = AUTO_APPLY_CALLBACK_STATUSES.indexOf(nextStatus);
  return nextIndex >= currentIndex;
}
