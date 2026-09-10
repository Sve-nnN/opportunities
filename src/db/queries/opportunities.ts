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
 * Plain LIMIT/OFFSET pair — both always caller-validated `number`s
 * (page.tsx's `parsePage`), never derived from an unvalidated string inside
 * the query layer itself (T-04-11/T-04-12). Drizzle binds both as
 * parameterized values, same guarantee as `eq()`/`ilike()` (T-02-04).
 */
export interface Pagination {
  limit: number;
  offset: number;
}

/**
 * Shared WHERE-condition builder for `listOpportunities`/`countOpportunities`
 * — keeps the two queries' filter semantics identical by construction
 * instead of by convention.
 */
function buildOpportunityConditions(
  source: OpportunitySource,
  filters: OpportunityFilters,
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

  return conditions;
}

/**
 * Reads one PAGE of rows (active AND inactive, unless narrowed by
 * `filters.status`) for a given source, newest first, optionally narrowed by
 * search text / category / role type / open-closed status. All filters
 * combine with AND.
 *
 * Inactive rows are intentionally included by default, not filtered out here
 * — DISC-03 requires the UI to *show* closed/inactive listings (via
 * `<StatusPill>`), not hide them. Ordered `postedAt desc nulls last, id desc`
 * so rows missing an upstream posted date sink to the bottom instead of
 * leading the table.
 *
 * `pagination` bounds the query to a single page via `.limit()/.offset()` —
 * 04-05-PLAN.md's whole point is that even the ACTIVE tab's query is now
 * bounded to `PAGE_SIZE` rows, not just the inactive tabs' (which already
 * only got a cheap `count()`, see `countActiveOpportunities` below).
 */
export async function listOpportunities(
  source: OpportunitySource,
  filters: OpportunityFilters = {},
  pagination: Pagination,
) {
  const conditions = buildOpportunityConditions(source, filters);

  return db
    .select()
    .from(opportunities)
    .where(and(...conditions))
    .orderBy(sql`${opportunities.postedAt} desc nulls last`, desc(opportunities.id))
    .limit(pagination.limit)
    .offset(pagination.offset);
}

/**
 * Filtered total row count for a source — same WHERE clause as
 * `listOpportunities` (via the shared `buildOpportunityConditions` helper),
 * but a single `count()` instead of the page's rows. Feeds
 * `PaginationControls`'s "Mostrando X–Y de Z" and the aria-live result
 * count — distinct from `countActiveOpportunities` below, which is always
 * scoped to `isActive: true` regardless of the current filter set.
 */
export async function countOpportunities(
  source: OpportunitySource,
  filters: OpportunityFilters = {},
): Promise<number> {
  const conditions = buildOpportunityConditions(source, filters);

  const [row] = await db
    .select({ value: count() })
    .from(opportunities)
    .where(and(...conditions));

  return row?.value ?? 0;
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

/**
 * Existence check for the Phase 6 apply-session callback route
 * (`opportunityExistsByExternalId`) — called BEFORE opening any
 * `db.transaction()`, so a URL `externalId` that matches no real
 * opportunity 404s without writing anything to `applications`/
 * `application_history` (06-CONTEXT.md: "no crea nada a ciegas"). Scoped
 * to 1 row via `.limit(1)` — this only needs a boolean, not the full row.
 */
export async function opportunityExistsByExternalId(
  externalId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: opportunities.id })
    .from(opportunities)
    .where(eq(opportunities.externalId, externalId))
    .limit(1);

  return rows.length > 0;
}

/**
 * Full row lookup for the Phase 7 "Send to AI" Server Action
 * (`generateApplyPrompt`) — unlike `opportunityExistsByExternalId` (which
 * only answers a boolean), the prompt builder needs real `title`/`company`/
 * `url` values, and it must read them server-side rather than trust
 * whatever a client component would otherwise pass in (07-01-PLAN.md
 * threat_model T-07-01). Same plain `.limit(1)` style as
 * `opportunityExistsByExternalId` above; returns `undefined` for an
 * externalId with no matching row.
 */
export async function getOpportunityByExternalId(externalId: string) {
  const rows = await db
    .select()
    .from(opportunities)
    .where(eq(opportunities.externalId, externalId))
    .limit(1);

  return rows[0];
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
