"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { upsertApplicationStatus } from "@/db/queries/applications";
import { APPLICATION_STATUSES } from "@/lib/application-status";

// T-03-01 (threat_model): the client dropdown's `status` value is untrusted
// — a modified client could POST any string. Validate against the exact
// 6-value enum before it ever reaches the DB; reject anything else instead
// of writing it.
const statusSchema = z.enum(APPLICATION_STATUSES);
const externalIdSchema = z.string().min(1);
const pathSchema = z.string().min(1).startsWith("/");

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
