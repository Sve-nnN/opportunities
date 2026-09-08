"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { updateProfileFieldValue as updateProfileFieldValueQuery, upsertProfileField } from "@/db/queries/profile";
import { normalizeToKey } from "@/lib/profile-key";

// T-05-01 (threat_model): label/value/category are untrusted client input —
// a modified client could send arbitrarily long strings. `key` is
// deliberately absent from this schema: it is NEVER accepted from the
// client, only ever derived server-side via normalizeToKey(label) below.
const entrySchema = z.object({
  label: z.string().trim().min(1).max(200),
  value: z.string().trim().min(1).max(2000),
  category: z.string().trim().min(1).max(200),
});
const keySchema = z.string().min(1);
// Same 2000-char cap as saveProfileFields' entrySchema.value and
// applications.ts's notesSchema — one length ceiling for free-text values
// across this codebase.
const valueSchema = z.string().trim().min(1).max(2000);

export interface SaveProfileFieldsResult {
  ok: boolean;
  savedCount?: number;
  error?: string;
}

/**
 * Server Action backing both "+ Agregar campo" (a 1-entry array) and
 * "Cargar datos básicos" (up to a 6-entry array). Each entry is validated
 * INDEPENDENTLY and an invalid entry is silently dropped rather than
 * failing the whole batch — this is what makes "leave a field blank to skip
 * it" in the bulk-load popover safe server-side, not just a client-side
 * convenience (UI-SPEC: "Any subset may be left blank; only non-empty
 * fields are created as rows"). `key` is derived per valid entry via
 * normalizeToKey(entry.label); `source` is always 'manual' here (Phase 6's
 * callback will use a different Server Action, not this one, for
 * `source: 'ai_session'` writes).
 */
export async function saveProfileFields(
  entries: { label: string; value: string; category: string }[],
): Promise<SaveProfileFieldsResult> {
  const validEntries: z.infer<typeof entrySchema>[] = [];
  for (const entry of entries) {
    const parsed = entrySchema.safeParse(entry);
    if (parsed.success) {
      validEntries.push(parsed.data);
    }
  }

  if (validEntries.length === 0) {
    return { ok: false, error: "No valid entries to save" };
  }

  for (const entry of validEntries) {
    await upsertProfileField({
      key: normalizeToKey(entry.label),
      label: entry.label,
      value: entry.value,
      category: entry.category,
      source: "manual",
    });
  }

  revalidatePath("/");

  return { ok: true, savedCount: validEntries.length };
}

export interface UpdateProfileFieldValueResult {
  ok: boolean;
  error?: string;
}

/**
 * Server Action invoked from the per-row pencil-edit popover's debounced
 * autosave (parity with `updateApplicationNotes` in
 * `app/actions/applications.ts`). `key` here always comes from an already-
 * rendered row (never client-derived from a label), but is still validated
 * as a non-empty string before reaching the query layer.
 */
export async function updateProfileFieldValue(
  key: string,
  value: string,
): Promise<UpdateProfileFieldValueResult> {
  const parsedKey = keySchema.safeParse(key);
  const parsedValue = valueSchema.safeParse(value);

  if (!parsedKey.success) {
    return { ok: false, error: "Missing key" };
  }
  if (!parsedValue.success) {
    return { ok: false, error: "Value must be 1-2000 characters" };
  }

  const updated = await updateProfileFieldValueQuery(
    parsedKey.data,
    parsedValue.data,
  );
  if (!updated) {
    return { ok: false, error: `No profile field found for key: ${key}` };
  }

  revalidatePath("/");

  return { ok: true };
}
