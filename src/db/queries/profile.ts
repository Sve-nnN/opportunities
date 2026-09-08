import { asc } from "drizzle-orm";

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

/**
 * Upsert-by-`key` (never the serial `id`), same pattern as
 * `upsertApplicationStatus`/`upsertApplicationNotes` in
 * `db/queries/applications.ts` — last write wins, no versioning
 * (CONTEXT.md: "sin versionado/historial de cambios de perfil"). Used both
 * for Juan's manual "+ Agregar campo"/"Cargar datos básicos" flows
 * (`source: 'manual'`) and, in Phase 6, the auto-apply callback
 * (`source: 'ai_session'`) — the same function, no new query needed there.
 */
export async function upsertProfileField(
  input: UpsertProfileFieldInput,
): Promise<void> {
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
}
