import { and, count, desc, eq, ilike, isNotNull, or, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { opportunities } from "@/db/schema";

/**
 * The two `opportunities.source` values this dashboard reads. `student-benefits`
 * lives in its own table (see `queries/benefits.ts`), not here.
 */
export type OpportunitySource =
  | "summer2027-internships"
  | "underclassmen-opportunities";

/** Open = `isActive` true, closed = `isActive` false. Omitting returns both. */
export type OpportunityStatus = "open" | "closed";

export interface OpportunityFilters {
  /** Matched (ILIKE, case-insensitive) against title OR company. */
  search?: string;
  /** Exact match — always parameterized via `eq()`, never raw SQL (T-02-04). */
  category?: string;
  /** Exact match — same parameterization guarantee as `category` (T-02-04). */
  roleType?: string;
  status?: OpportunityStatus;
}

/**
 * Reads rows (active AND inactive, unless narrowed by `filters.status`) for a
 * given source, newest first, optionally narrowed by search text / category /
 * role type / open-closed status. All filters combine with AND.
 *
 * Inactive rows are intentionally included by default, not filtered out here
 * — DISC-03 requires the UI to *show* closed/inactive listings (via
 * `<StatusPill>`), not hide them. Ordered `postedAt desc nulls last, id desc`
 * so rows missing an upstream posted date sink to the bottom instead of
 * leading the table.
 */
export async function listOpportunities(
  source: OpportunitySource,
  filters: OpportunityFilters = {},
) {
  const conditions = [eq(opportunities.source, source)];

  const search = filters.search?.trim();
  if (search) {
    const term = `%${search}%`;
    conditions.push(
      or(ilike(opportunities.title, term), ilike(opportunities.company, term))!,
    );
  }

  if (filters.category) {
    conditions.push(eq(opportunities.category, filters.category));
  }

  if (filters.roleType) {
    conditions.push(eq(opportunities.roleType, filters.roleType));
  }

  if (filters.status === "open") {
    conditions.push(eq(opportunities.isActive, true));
  } else if (filters.status === "closed") {
    conditions.push(eq(opportunities.isActive, false));
  }

  return db
    .select()
    .from(opportunities)
    .where(and(...conditions))
    .orderBy(sql`${opportunities.postedAt} desc nulls last`, desc(opportunities.id));
}

/**
 * Count of `isActive` rows for a source — same "what's actionable today"
 * definition as `countActive()` in page.tsx, but computed in SQL instead of
 * fetching every row just to filter+count them client-side. Used for the
 * inactive tabs' badge counts, where the full row set is deliberately NOT
 * fetched (see page.tsx) to keep every navigation's RSC payload scoped to
 * the tab actually being viewed.
 */
export async function countActiveOpportunities(
  source: OpportunitySource,
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(opportunities)
    .where(and(eq(opportunities.source, source), eq(opportunities.isActive, true)));

  return row?.value ?? 0;
}

/**
 * Distinct, non-null `category` values actually present for a source — feeds
 * the filter-chip options (search-bar.tsx/filter-chips.tsx, 02-02-PLAN.md
 * Task 2) so chips only ever offer values that exist in the data, never a
 * dead filter with zero possible matches.
 */
export async function getDistinctCategories(
  source: OpportunitySource,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ category: opportunities.category })
    .from(opportunities)
    .where(and(eq(opportunities.source, source), isNotNull(opportunities.category)));

  return rows
    .map((row) => row.category)
    .filter((category): category is string => Boolean(category))
    .sort((a, b) => a.localeCompare(b));
}

/** Same contract as `getDistinctCategories`, for `roleType`. */
export async function getDistinctRoleTypes(
  source: OpportunitySource,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ roleType: opportunities.roleType })
    .from(opportunities)
    .where(and(eq(opportunities.source, source), isNotNull(opportunities.roleType)));

  return rows
    .map((row) => row.roleType)
    .filter((roleType): roleType is string => Boolean(roleType))
    .sort((a, b) => a.localeCompare(b));
}
