import { asc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { profileFields } from "@/db/schema";

/** Inferred from the `profile_fields` row shape — no separate hand-typed type. */
export type ProfileField = typeof profileFields.$inferSelect;

/**
 * All profile fields, ordered by `createdAt` ascending (insertion order,
 * per UI-SPEC "Layout — Perfil Tab": groups and rows within a group render
 * in the order they were first created, not alphabetically or by category).
 * No filters — this is a single-user profile with a low row count (single
 * digits to low dozens per UI-SPEC), unlike the paginated opportunities/
 * benefits queries.
 */
export async function getAllProfileFields(): Promise<ProfileField[]> {
  return db.select().from(profileFields).orderBy(asc(profileFields.createdAt));
}

export interface UpsertProfileFieldInput {
  key: string;
  label: string;
  value: string;
  category: string;
  source: string;
}

export interface UpsertProfileFieldResult {
  /**
   * True when a row already existed for `input.key` AND its `label`
   * differs from `input.label` — i.e. `normalizeToKey` collided two
   * distinct-looking labels onto the same key (05-REVIEW.md CR-01: e.g.
   * "LinkedIn" and "linkedin" both normalize to `key = "linkedin"`).
   * False for a fresh insert, and false for a genuine re-save of the same
   * label (expected "last value wins" edit, not a surprising collision).
   */
  collided: boolean;
  /** The pre-existing row's label, present whenever a row for this key already existed (collided or not). */
  existingLabel?: string;
}

/**
 * Upsert-by-`key` (never the serial `id`), same pattern as
 * `upsertApplicationStatus`/`upsertApplicationNotes` in
 * `db/queries/applications.ts` — last write wins, no versioning
 * (CONTEXT.md: "sin versionado/historial de cambios de perfil"). Used both
 * for Juan's manual "+ Agregar campo"/"Cargar datos básicos" flows
 * (`source: 'manual'`) and, in Phase 6, the auto-apply callback
 * (`source: 'ai_session'`) — the same function, no new query needed there.
 *
 * 05-REVIEW.md CR-01: `normalizeToKey` is not injective, so two distinct
 * labels can collide onto the same `key` and silently overwrite each
 * other via `onConflictDoUpdate`. This function now checks for an
 * existing row on `key` BEFORE writing and reports whether the write is a
 * same-label update (unsurprising) or a different-label collision, so the
 * caller (`saveProfileFields`) can surface that to Juan instead of always
 * reporting a plain "Guardado".
 */
export async function upsertProfileField(
  input: UpsertProfileFieldInput,
): Promise<UpsertProfileFieldResult> {
  const existing = await db
    .select({ label: profileFields.label })
    .from(profileFields)
    .where(eq(profileFields.key, input.key));

  const existingLabel = existing[0]?.label;
  const collided = existingLabel !== undefined && existingLabel !== input.label;

  await db
    .insert(profileFields)
    .values(input)
    .onConflictDoUpdate({
      target: profileFields.key,
      set: {
        label: input.label,
        value: input.value,
        category: input.category,
        source: input.source,
        updatedAt: new Date(),
      },
    });

  return { collided, existingLabel };
}

/**
 * Deliberately NOT an upsert (unlike `upsertProfileField` above) — the
 * pencil-edit popover only ever opens on a row that already exists in the
 * DOM, so a `key` that doesn't match any row means the row was
 * deleted/renamed elsewhere. Updates ONLY `value` (+ `updatedAt`), leaving
 * `label`/`category`/`source` untouched, and returns `false` (no row
 * touched) instead of resurrecting a row for an unknown `key`.
 */
export async function updateProfileFieldValue(
  key: string,
  value: string,
): Promise<boolean> {
  const updatedRows = await db
    .update(profileFields)
    .set({ value, updatedAt: new Date() })
    .where(eq(profileFields.key, key))
    .returning({ id: profileFields.id });

  return updatedRows.length > 0;
}
