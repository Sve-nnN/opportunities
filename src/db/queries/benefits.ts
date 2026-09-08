import { and, asc, count, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { benefits } from "@/db/schema";

export interface BenefitFilters {
  /** Matched (ILIKE, case-insensitive) against title, description, OR any tag. */
  search?: string;
  /** Exact containment check against the `tags` jsonb array (not wired to a chip yet — see 02-02-SUMMARY.md). */
  tag?: string;
  /**
   * Optional `isActive` narrowing — added for `countBenefits`'s active-tab
   * badge use (page.tsx: "actionable within the current filter" count,
   * mirroring `opportunityFilters.status === "open"`). `listBenefits` never
   * sets this itself (DISC-03: show active AND inactive by default).
   */
  isActive?: boolean;
}

/**
 * Plain LIMIT/OFFSET pair — see `Pagination` in `queries/opportunities.ts`
 * for the same contract (always caller-validated numbers, never derived
 * from an unvalidated string here).
 */
export interface Pagination {
  limit: number;
  offset: number;
}

/**
 * Shared WHERE-condition builder for `listBenefits`/`countBenefits` — keeps
 * the two queries' filter semantics identical by construction instead of by
 * convention (mirrors `buildOpportunityConditions` in `queries/opportunities.ts`).
 */
function buildBenefitConditions(filters: BenefitFilters) {
  const conditions = [];

  const search = filters.search?.trim();
  if (search) {
    const term = `%${search}%`;
    conditions.push(
      sql`(
        ${benefits.title} ILIKE ${term}
        OR ${benefits.description} ILIKE ${term}
        OR ${benefits.tags}::text ILIKE ${term}
      )`,
    );
  }

  if (filters.tag) {
    conditions.push(sql`${benefits.tags} @> ${JSON.stringify([filters.tag])}::jsonb`);
  }

  if (filters.isActive !== undefined) {
    conditions.push(eq(benefits.isActive, filters.isActive));
  }

  return conditions;
}

/**
 * Reads one PAGE of `student-benefits` rows (active AND inactive — same
 * visibility rule as `listOpportunities`), ordered by title, optionally
 * narrowed by search text / tag. Mirrors `listOpportunities`'s shape: plain
 * Drizzle query builder, no raw string concatenation of user input
 * (T-02-04) — every user-controlled value below is passed as a bound `sql`
 * template parameter.
 *
 * `pagination` bounds the query to a single page via `.limit()/.offset()`
 * — same 04-05-PLAN.md rationale as `listOpportunities`.
 */
export async function listBenefits(
  filters: BenefitFilters = {},
  pagination: Pagination,
) {
  const conditions = buildBenefitConditions(filters);

  const query = db.select().from(benefits);
  const filtered =
    conditions.length > 0
      ? query.where(and(...conditions)).orderBy(asc(benefits.title))
      : query.orderBy(asc(benefits.title));

  return filtered.limit(pagination.limit).offset(pagination.offset);
}

/**
 * Filtered total row count for `student-benefits` — same WHERE clause as
 * `listBenefits` (via the shared `buildBenefitConditions` helper), but a
 * single `count()` instead of the page's rows. Feeds
 * `PaginationControls`'s "Mostrando X–Y de Z" and the aria-live result
 * count — distinct from `countActiveBenefits` below, which is always
 * scoped to `isActive: true` regardless of the current filter set.
 */
export async function countBenefits(filters: BenefitFilters = {}): Promise<number> {
  const conditions = buildBenefitConditions(filters);

  const [row] =
    conditions.length > 0
      ? await db
          .select({ value: count() })
          .from(benefits)
          .where(and(...conditions))
      : await db.select({ value: count() }).from(benefits);

  return row?.value ?? 0;
}

/** Same contract as `countActiveOpportunities` (queries/opportunities.ts), for `student-benefits`. */
export async function countActiveBenefits(): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(benefits)
    .where(eq(benefits.isActive, true));

  return row?.value ?? 0;
}
