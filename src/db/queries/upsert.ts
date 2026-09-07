import { and, eq, notInArray } from "drizzle-orm";

import type { Database } from "../client";
import { benefits, opportunities } from "../schema";
import type { NormalizedBenefit, NormalizedOpportunity } from "../../ingestion/normalize";

export interface UpsertBenefitsResult {
  rowsUpserted: number;
  rowsSoftDeleted: number;
}

/**
 * Upsert normalized benefit rows by `external_id` (never a serial id, per
 * research/ARCHITECTURE.md Anti-Pattern 2), then soft-delete any existing
 * `is_active = true` row whose external_id was NOT present in this sync's
 * row set (research/ARCHITECTURE.md Pattern 3 — never a hard delete).
 */
export async function upsertBenefits(
  db: Database,
  rows: NormalizedBenefit[],
): Promise<UpsertBenefitsResult> {
  if (rows.length === 0) {
    return { rowsUpserted: 0, rowsSoftDeleted: 0 };
  }

  for (const row of rows) {
    await db
      .insert(benefits)
      .values({
        externalId: row.externalId,
        source: row.source,
        title: row.title,
        description: row.description,
        imageSrc: row.imageSrc,
        tags: row.tags,
        campusRequired: row.campusRequired,
        isActive: true,
        lastSeenAt: row.lastSeenAt,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: benefits.externalId,
        set: {
          source: row.source,
          title: row.title,
          description: row.description,
          imageSrc: row.imageSrc,
          tags: row.tags,
          campusRequired: row.campusRequired,
          isActive: true,
          lastSeenAt: row.lastSeenAt,
          updatedAt: new Date(),
        },
      });
  }

  const seenExternalIds = rows.map((row) => row.externalId);

  const softDeleted = await db
    .update(benefits)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      and(
        eq(benefits.source, "student-benefits"),
        eq(benefits.isActive, true),
        notInArray(benefits.externalId, seenExternalIds),
      ),
    )
    .returning({ id: benefits.id });

  return {
    rowsUpserted: rows.length,
    rowsSoftDeleted: softDeleted.length,
  };
}

export interface UpsertOpportunitiesResult {
  rowsUpserted: number;
  rowsSoftDeleted: number;
}

/**
 * Upsert normalized opportunity rows by `external_id`, then soft-delete any
 * existing `opportunities` row for THIS SPECIFIC `source` whose external_id
 * was not in this run's row set. Scoping both the upsert and the soft-delete
 * WHERE clause to `source` is required so a summer2027-internships sync can
 * never soft-delete underclassmen-opportunities rows (or vice versa) —
 * must_have per 01-02-PLAN.md.
 */
export async function upsertOpportunities(
  db: Database,
  rows: NormalizedOpportunity[],
  source: string,
): Promise<UpsertOpportunitiesResult> {
  if (rows.length === 0) {
    return { rowsUpserted: 0, rowsSoftDeleted: 0 };
  }

  for (const row of rows) {
    await db
      .insert(opportunities)
      .values({
        externalId: row.externalId,
        source: row.source,
        title: row.title,
        company: row.company,
        location: row.location,
        category: row.category,
        roleType: row.roleType,
        url: row.url,
        isActive: row.isActive,
        postedAt: row.postedAt,
        raw: row.raw,
        lastSeenAt: row.lastSeenAt,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: opportunities.externalId,
        set: {
          source: row.source,
          title: row.title,
          company: row.company,
          location: row.location,
          category: row.category,
          roleType: row.roleType,
          url: row.url,
          isActive: row.isActive,
          postedAt: row.postedAt,
          raw: row.raw,
          lastSeenAt: row.lastSeenAt,
          updatedAt: new Date(),
        },
      });
  }

  const seenExternalIds = rows.map((row) => row.externalId);

  const softDeleted = await db
    .update(opportunities)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      and(
        eq(opportunities.source, source),
        eq(opportunities.isActive, true),
        notInArray(opportunities.externalId, seenExternalIds),
      ),
    )
    .returning({ id: opportunities.id });

  return {
    rowsUpserted: rows.length,
    rowsSoftDeleted: softDeleted.length,
  };
}
