/**
 * The 6 valid application-tracking states, occupying the same `status: text`
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
 */
export const APPLICATION_STATUSES = [
  "saved",
  "not_applied",
  "applied",
  "in_progress",
  "rejected",
  "accepted",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
