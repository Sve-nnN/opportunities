import assert from "node:assert/strict";

import { eq } from "drizzle-orm";

import { db } from "../src/db/client";
import { applications, opportunities } from "../src/db/schema";
import {
  getApplicationsByExternalIds,
  upsertApplicationStatus,
} from "../src/db/queries/applications";
import {
  APPLICATION_STATUSES,
  MANUALLY_SELECTABLE_STATUSES,
  type ApplicationStatus,
} from "../src/lib/application-status";

/**
 * Ad hoc regression check for 05-02's status extension (same no-test-
 * framework convention as scripts/verify-applications.ts). Data layer only:
 * confirms MANUALLY_SELECTABLE_STATUSES (6) / APPLICATION_STATUSES (9)
 * shapes, and that applications.status accepts the 3 new auto-apply values
 * with no migration — writes each via upsertApplicationStatus and reads it
 * back via getApplicationsByExternalIds against live Postgres. A browser
 * layer (05-02-PLAN.md Task 2) is added on top of this file separately.
 *
 * Run:
 *   DATABASE_URL=postgresql://postgres:devpassword@127.0.0.1:5434/opportunities \
 *     pnpm exec tsx scripts/verify-status-extension.ts
 */

const AUTO_STATUSES: ApplicationStatus[] = [
  "auto_fill_in_progress",
  "ready_to_review",
  "submitted",
];

async function main() {
  // Behavior 0: shape checks — MANUALLY_SELECTABLE_STATUSES is exactly the
  // 6 original values (none of the 3 new ones), APPLICATION_STATUSES is 9.
  assert.equal(
    MANUALLY_SELECTABLE_STATUSES.length,
    6,
    `expected MANUALLY_SELECTABLE_STATUSES to have exactly 6 values, got ${MANUALLY_SELECTABLE_STATUSES.length}`,
  );
  for (const auto of AUTO_STATUSES) {
    assert.ok(
      !(MANUALLY_SELECTABLE_STATUSES as readonly string[]).includes(auto),
      `MANUALLY_SELECTABLE_STATUSES must not include the auto-apply status "${auto}"`,
    );
  }
  assert.equal(
    APPLICATION_STATUSES.length,
    9,
    `expected APPLICATION_STATUSES to have exactly 9 values, got ${APPLICATION_STATUSES.length}`,
  );
  for (const auto of AUTO_STATUSES) {
    assert.ok(
      (APPLICATION_STATUSES as readonly string[]).includes(auto),
      `APPLICATION_STATUSES must include the auto-apply status "${auto}"`,
    );
  }
  console.log(
    "PASS: MANUALLY_SELECTABLE_STATUSES has exactly the 6 original values, APPLICATION_STATUSES has all 9",
  );

  // Behavior 1: applications.status accepts the 3 new values with no
  // migration — write + read back each on a real external_id.
  const [sampleRow] = await db
    .select({ externalId: opportunities.externalId })
    .from(opportunities)
    .limit(1);
  assert.ok(
    sampleRow,
    "expected at least 1 real opportunities row to build a test external_id from",
  );
  const externalId = sampleRow.externalId;

  const [existing] = await db
    .select({ id: applications.id, status: applications.status })
    .from(applications)
    .where(eq(applications.opportunityExternalId, externalId));
  const preExisting = Boolean(existing);
  const preExistingStatus = existing?.status;

  try {
    for (const status of AUTO_STATUSES) {
      await upsertApplicationStatus(externalId, status);
      const resultMap = await getApplicationsByExternalIds([externalId]);
      const record = resultMap.get(externalId);
      assert.ok(record, `expected a map entry for ${externalId} after writing "${status}"`);
      assert.equal(
        record.status,
        status,
        `expected "${externalId}" to read back status="${status}", got "${record.status}"`,
      );
    }
    console.log(
      `PASS: applications.status accepted and read back all 3 new values (${AUTO_STATUSES.join(", ")}) with no migration`,
    );
  } finally {
    // Restore/clean up (same convention as verify-applications.ts): if the
    // row pre-existed, restore its original status rather than deleting it;
    // if this script created it, delete it entirely.
    if (preExisting && preExistingStatus) {
      await upsertApplicationStatus(externalId, preExistingStatus as ApplicationStatus);
      console.log(`Cleanup: restored pre-existing status "${preExistingStatus}" for ${externalId}.`);
    } else if (!preExisting) {
      await db.delete(applications).where(eq(applications.opportunityExternalId, externalId));
      console.log(`Cleanup: deleted test-created applications row for ${externalId}.`);
    }
  }

  console.log("\nAll status-extension data-layer behaviors verified against live Postgres.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Status extension verification FAILED:", error);
    process.exit(1);
  });
