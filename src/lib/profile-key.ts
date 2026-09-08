/**
 * Derives `profile_fields.key` from a human-typed `label` — the ONLY place
 * in this codebase a profile field `key` is produced (05-01-PLAN.md
 * threat_model T-05-01: no Server Action ever accepts a client-provided
 * `key`). Snake_case, lowercase, no diacritics, no leading/trailing
 * underscores, no duplicated underscores where multiple non-alphanumeric
 * characters run together (e.g. a space next to a slash).
 *
 * "Teléfono" -> "telefono" (NFD-normalize + strip Unicode combining marks
 * U+0300-U+036F, so accented Spanish labels never leak an accent into a DB
 * key or a future Phase 6 callback lookup).
 */
export function normalizeToKey(label: string): string {
  const diacriticMarks = new RegExp("[\\u0300-\\u036f]", "g");
  const withoutDiacritics = label.normalize("NFD").replace(diacriticMarks, "");
  const lower = withoutDiacritics.toLowerCase();
  const snakeCase = lower.replace(/[^a-z0-9]+/g, "_");
  return snakeCase.replace(/^_+|_+$/g, "");
}
