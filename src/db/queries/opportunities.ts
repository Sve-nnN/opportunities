import { desc, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { opportunities } from "@/db/schema";

/**
 * The two `opportunities.source` values this dashboard reads. `student-benefits`
 * lives in its own table (see `queries/benefits.ts`), not here.
 */
export type OpportunitySource =
  | "summer2027-internships"
  | "underclassmen-opportunities";

/**
 * Reads every row (active AND inactive) for a given source, newest first.
 *
 * Inactive rows are intentionally included, not filtered out here — DISC-03
 * requires the UI to *show* closed/inactive listings (via `<StatusPill>`),
 * not hide them. Ordered `postedAt desc nulls last, id desc` so rows missing
 * an upstream posted date sink to the bottom instead of leading the table.
 */
export async function listOpportunities(source: OpportunitySource) {
  return db
    .select()
    .from(opportunities)
    .where(eq(opportunities.source, source))
    .orderBy(sql`${opportunities.postedAt} desc nulls last`, desc(opportunities.id));
}
