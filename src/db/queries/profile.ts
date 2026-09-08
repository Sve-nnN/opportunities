import { asc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { profileFields } from "@/db/schema";

/** Inferred from the `profile_fields` row shape — no separate hand-typed type. */
export type ProfileField = typeof profileFields.$inferSelect;

/**
 * Anything that exposes the same `.select()/.insert()/.onConflictDoUpdate()`
 * surface `upsertProfileField` needs — either the top-level `db` handle or
 * the `tx` handle Drizzle passes into a `db.transaction(async (tx) => ...)`
 * callback. Derived structurally from `db.transaction`'s own callback
 * parameter type (rather than hand-typed against `NodePgDatabase`/
 * `NodePgTransaction` generics) so it can never drift out of sync with the
 * installed drizzle-orm version's actual transaction type.
 */
type TransactionCallback = Parameters<typeof db.transaction>[0];
type Transaction = Parameters<TransactionCallback>[0];
type Executor = typeof db | Transaction;

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
 *
 * `executor` (optional, defaults to the top-level `db`) lets the Phase 6
 * apply-session callback route pass its `tx` handle so this same
 * collision-detecting select-then-upsert runs INSIDE that route's single
 * atomic `db.transaction()` — a collision there must abort the entire
 * callback write (status + history, not just the profile row), which only
 * works if this function's reads/writes participate in that same
 * transaction rather than opening their own (06-CONTEXT.md: "la escritura
 * falla con error claro, nunca sobreescribe en silencio" refers to the
 * WHOLE callback write, not just this table).
 */
export async function upsertProfileField(
  input: UpsertProfileFieldInput,
  executor: Executor = db,
): Promise<UpsertProfileFieldResult> {
  const existing = await executor
    .select({ label: profileFields.label })
    .from(profileFields)
    .where(eq(profileFields.key, input.key));

  const existingLabel = existing[0]?.label;
  const collided = existingLabel !== undefined && existingLabel !== input.label;

  await executor
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
