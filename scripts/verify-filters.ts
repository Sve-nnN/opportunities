import assert from "node:assert/strict";

import { sql } from "drizzle-orm";

import { db } from "../src/db/client";
import { benefits, opportunities } from "../src/db/schema";
import {
  getDistinctCategories,
  getDistinctRoleTypes,
  listOpportunities,
} from "../src/db/queries/opportunities";
import { listBenefits } from "../src/db/queries/benefits";

/**
 * Ad hoc regression check for 02-02's filterable queries, run directly
 * against live Postgres via `tsx` (same convention as Phase 1's
 * runSync()/direct-pg verification — no test framework in this project's
 * stack, see STACK.md). Not wired into a `pnpm test` script; run manually:
 *
 *   DATABASE_URL=postgresql://postgres:devpassword@127.0.0.1:5434/opportunities \
 *     pnpm exec tsx scripts/verify-filters.ts
 *
 * Every value filtered on below is derived from a live row (never
 * hardcoded), so a non-zero match count is guaranteed by construction.
 */
async function main() {
  const source = "summer2027-internships" as const;

  const [sampleOpportunity] = await db
    .select({ company: opportunities.company })
    .from(opportunities)
    .where(
      sql`${opportunities.source} = ${source} AND ${opportunities.company} IS NOT NULL AND length(${opportunities.company}) >= 4`,
    )
    .limit(1);
  assert.ok(
    sampleOpportunity?.company,
    "expected at least one internship row with a company name >= 4 chars to build a search term from",
  );
  const searchTerm = sampleOpportunity.company!.slice(0, 4);

  const [sampleCategoryRow] = await db
    .select({ category: opportunities.category })
    .from(opportunities)
    .where(
      sql`${opportunities.source} = ${source} AND ${opportunities.category} IS NOT NULL`,
    )
    .limit(1);
  assert.ok(
    sampleCategoryRow?.category,
    "expected at least one internship row with a non-null category",
  );
  const sampleCategory = sampleCategoryRow.category!;

  const [sampleBenefit] = await db
    .select({ title: benefits.title })
    .from(benefits)
    .where(sql`length(${benefits.title}) >= 4`)
    .limit(1);
  assert.ok(
    sampleBenefit?.title,
    "expected at least one benefit row with a title >= 4 chars",
  );
  const benefitSearchTerm = sampleBenefit.title!.slice(0, 4);

  // Behavior 1: search matches title OR company, case-insensitively.
  const searchResults = await listOpportunities(source, { search: searchTerm });
  assert.ok(
    searchResults.length > 0,
    `expected at least one match for search="${searchTerm}"`,
  );
  for (const row of searchResults) {
    const haystack = `${row.title ?? ""} ${row.company ?? ""}`.toLowerCase();
    assert.ok(
      haystack.includes(searchTerm.toLowerCase()),
      `row ${row.externalId} did not match search term "${searchTerm}"`,
    );
  }

  // Behavior 2: category filter is an exact match.
  const categoryResults = await listOpportunities(source, {
    category: sampleCategory,
  });
  assert.ok(
    categoryResults.length > 0,
    `expected at least one match for category="${sampleCategory}"`,
  );
  assert.ok(
    categoryResults.every((row) => row.category === sampleCategory),
    "category filter returned a row with a different category",
  );

  // Behavior 3: status filter narrows to isActive true/false; omitting returns both.
  const openResults = await listOpportunities(source, { status: "open" });
  assert.ok(
    openResults.every((row) => row.isActive === true),
    "status=open returned an inactive row",
  );
  const closedResults = await listOpportunities(source, { status: "closed" });
  assert.ok(
    closedResults.every((row) => row.isActive === false),
    "status=closed returned an active row",
  );
  const unfilteredResults = await listOpportunities(source);
  assert.ok(
    unfilteredResults.some((row) => row.isActive) &&
      unfilteredResults.some((row) => !row.isActive),
    "omitting status should return both active and inactive rows",
  );

  // Behavior 4: combined filters AND together; zero matches return [] without throwing.
  const combinedResults = await listOpportunities(source, {
    search: searchTerm,
    category: sampleCategory,
    status: "open",
  });
  assert.ok(
    combinedResults.every(
      (row) => row.isActive === true && row.category === sampleCategory,
    ),
    "combined filters did not apply as AND",
  );
  const zeroMatchResults = await listOpportunities(source, {
    search: "zzzz-no-such-opportunity-should-ever-match-zzzz",
  });
  assert.deepEqual(
    zeroMatchResults,
    [],
    "expected a zero-match search to return [] without throwing",
  );

  // Behavior 5: benefits search matches title/description/tag, case-insensitively.
  const benefitResults = await listBenefits({ search: benefitSearchTerm });
  assert.ok(
    benefitResults.length > 0,
    `expected at least one benefit match for search="${benefitSearchTerm}"`,
  );

  // getDistinctCategories/getDistinctRoleTypes feed real, non-dead chip options.
  const categories = await getDistinctCategories(source);
  assert.ok(categories.length > 0, "expected at least one distinct category");
  assert.ok(
    categories.includes(sampleCategory),
    "getDistinctCategories should include the known sample category",
  );
  const roleTypes = await getDistinctRoleTypes(source);
  assert.ok(Array.isArray(roleTypes), "getDistinctRoleTypes should return an array");

  console.log("All filter behaviors verified against live Postgres.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Filter verification FAILED:", error);
    process.exit(1);
  });
