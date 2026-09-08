import { inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { applications } from "@/db/schema";
import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
} from "@/lib/application-status";

// Re-exported so existing callers (`app/actions/applications.ts`) keep a
// single import path for the enum; the canonical definition lives in
// `@/lib/application-status` (no `pg` import — see that file's comment for
// why this module itself must never be imported from a client component).
export { APPLICATION_STATUSES, type ApplicationStatus };

export interface ApplicationRecord {
  status: ApplicationStatus;
  notes: string | null;
  isSaved: boolean;
}

/**
 * One query for every `external_id` a page render needs (Internships +
 * Underclassmen combined, both read from the same `applications` table) —
 * avoids an N+1 per-row lookup. Returns a Map keyed by `external_id` for an
 * in-memory join in `page.tsx`; a missing key means "never tracked," which
 * callers must default to `not_applied`, never treat as an error.
 */
export async function getApplicationsByExternalIds(
  externalIds: string[],
): Promise<Map<string, ApplicationRecord>> {
  if (externalIds.length === 0) return new Map();

  const rows = await db
    .select({
      opportunityExternalId: applications.opportunityExternalId,
      status: applications.status,
      notes: applications.notes,
      isSaved: applications.isSaved,
    })
    .from(applications)
    .where(inArray(applications.opportunityExternalId, externalIds));

  const map = new Map<string, ApplicationRecord>();
  for (const row of rows) {
    map.set(row.opportunityExternalId, {
      status: row.status as ApplicationStatus,
      notes: row.notes,
      isSaved: row.isSaved,
    });
  }
  return map;
}

/**
 * Upsert-by-`opportunity_external_id` (never the `opportunities`/`benefits`
 * cache table's serial `id` — research/ARCHITECTURE.md Anti-Pattern 2), so
 * a tracked status survives cache-row churn across syncs. Relies on the
 * UNIQUE constraint added by this plan's migration (drizzle/0001_*.sql) to
 * give `onConflictDoUpdate` a real target.
 */
export async function upsertApplicationStatus(
  opportunityExternalId: string,
  status: ApplicationStatus,
): Promise<void> {
  await db
    .insert(applications)
    .values({ opportunityExternalId, status })
    .onConflictDoUpdate({
      target: applications.opportunityExternalId,
      set: { status, updatedAt: new Date() },
    });
}
