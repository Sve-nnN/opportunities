"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  upsertApplicationNotes,
  upsertApplicationStatus,
} from "@/db/queries/applications";
import { MANUALLY_SELECTABLE_STATUSES } from "@/lib/application-status";

// T-03-01 (threat_model): the client dropdown's `status` value is untrusted
// — a modified client could POST any string. Validate against the exact
// 6-value manually-selectable enum before it ever reaches the DB; reject
// anything else instead of writing it. T-05-04 (05-02-PLAN.md
// threat_model) extends this: `MANUALLY_SELECTABLE_STATUSES` (6 values),
// not `APPLICATION_STATUSES` (9 values), is the schema here on purpose —
// the 3 new read-only auto-apply states (auto_fill_in_progress,
// ready_to_review, submitted) must never be writable through this manual
// Server Action, even by a modified client that POSTs one directly. Only
// the Phase 6 callback API (out of this plan's scope) may set them.
const statusSchema = z.enum(MANUALLY_SELECTABLE_STATUSES);
const externalIdSchema = z.string().min(1);
const pathSchema = z.string().min(1).startsWith("/");
// T-03-03 (threat_model): free-text notes are untrusted client input that
// gets rendered back into the DOM — cap length before it ever reaches
// Postgres. React escapes on render, so no HTML/markdown interpretation risk
// beyond length; 2000 chars is generous for a per-opportunity note.
const notesSchema = z.string().max(2000);

export interface UpdateApplicationStatusResult {
  ok: boolean;
  error?: string;
}

/**
 * Server Action invoked from `StatusDropdown` (client component) whenever
 * Juan changes a row's status. Upserts by `opportunityExternalId` (never a
 * serial cache-row id) and revalidates the page that rendered the dropdown
 * so the new value is visible on refresh without a client-side cache to
 * invalidate (server-first, no React Query per 03-CONTEXT.md).
 */
export async function updateApplicationStatus(
  opportunityExternalId: string,
  status: string,
  pathToRevalidate: string,
): Promise<UpdateApplicationStatusResult> {
  const parsedExternalId = externalIdSchema.safeParse(opportunityExternalId);
  const parsedStatus = statusSchema.safeParse(status);
  const parsedPath = pathSchema.safeParse(pathToRevalidate);

  if (!parsedExternalId.success) {
    return { ok: false, error: "Missing opportunityExternalId" };
  }
  if (!parsedStatus.success) {
    return { ok: false, error: `Invalid status: ${status}` };
  }
  if (!parsedPath.success) {
    return { ok: false, error: "Invalid path to revalidate" };
  }

  await upsertApplicationStatus(parsedExternalId.data, parsedStatus.data);
  revalidatePath(parsedPath.data);

  return { ok: true };
}

export interface UpdateApplicationNotesResult {
  ok: boolean;
  error?: string;
}

/**
 * Server Action invoked from `NotesPopover` (client component) on every
 * debounced autosave tick — never from an explicit "Guardar" button
 * (03-CONTEXT.md). Upserts by `opportunityExternalId`, same as
 * `updateApplicationStatus`, and revalidates the page so a reload/other
 * device reflects the latest saved note.
 */
export async function updateApplicationNotes(
  opportunityExternalId: string,
  notes: string,
  pathToRevalidate: string,
): Promise<UpdateApplicationNotesResult> {
  const parsedExternalId = externalIdSchema.safeParse(opportunityExternalId);
  const parsedNotes = notesSchema.safeParse(notes);
  const parsedPath = pathSchema.safeParse(pathToRevalidate);

  if (!parsedExternalId.success) {
    return { ok: false, error: "Missing opportunityExternalId" };
  }
  if (!parsedNotes.success) {
    return { ok: false, error: "Notes exceed the 2000-character limit" };
  }
  if (!parsedPath.success) {
    return { ok: false, error: "Invalid path to revalidate" };
  }

  await upsertApplicationNotes(parsedExternalId.data, parsedNotes.data);
  revalidatePath(parsedPath.data);

  return { ok: true };
}
