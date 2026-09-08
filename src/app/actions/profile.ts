"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { upsertProfileField } from "@/db/queries/profile";
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
