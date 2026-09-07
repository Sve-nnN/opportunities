import { and, asc, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { benefits } from "@/db/schema";

export interface BenefitFilters {
  /** Matched (ILIKE, case-insensitive) against title, description, OR any tag. */
  search?: string;
  /** Exact containment check against the `tags` jsonb array (not wired to a chip yet — see 02-02-SUMMARY.md). */
  tag?: string;
}

/**
 * Reads `student-benefits` rows (active AND inactive — same visibility rule
 * as `listOpportunities`), ordered by title, optionally narrowed by search
 * text / tag. Mirrors `listOpportunities`'s shape: plain Drizzle query
 * builder, no raw string concatenation of user input (T-02-04) — every
 * user-controlled value below is passed as a bound `sql` template parameter.
 */
export async function listBenefits(filters: BenefitFilters = {}) {
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

  const query = db.select().from(benefits);
  if (conditions.length > 0) {
    return query.where(and(...conditions)).orderBy(asc(benefits.title));
  }
  return query.orderBy(asc(benefits.title));
}
