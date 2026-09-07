import { asc } from "drizzle-orm";

import { db } from "@/db/client";
import { benefits } from "@/db/schema";

/**
 * Reads every `student-benefits` row (active AND inactive — same visibility
 * rule as `listOpportunities`), ordered by title. Mirrors that function's
 * shape: plain Drizzle query builder, no raw SQL.
 */
export async function listBenefits() {
  return db.select().from(benefits).orderBy(asc(benefits.title));
}
