import assert from "node:assert/strict";

import { eq } from "drizzle-orm";
import { chromium } from "playwright";

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
 * framework convention as scripts/verify-applications.ts and
 * scripts/verify-a11y.ts). Two phases:
 *
 * 1. Data layer (always runs): confirms MANUALLY_SELECTABLE_STATUSES (6) /
 *    APPLICATION_STATUSES (9) shapes, and that applications.status accepts
 *    the 3 new auto-apply values with no migration — writes each via
 *    upsertApplicationStatus and reads it back via
 *    getApplicationsByExternalIds against live Postgres.
 * 2. Browser layer (05-02-PLAN.md Task 2, only runs when a baseUrl arg is
 *    given): grabs the externalId of the first row Turbopack actually
 *    renders (virtualization only mounts visible rows, so a random DB row
 *    picked via a bare LIMIT 1 query is very likely NOT mounted — reading
 *    it back out of the live DOM instead guarantees the row under test is
 *    on-screen), sets its status to `submitted` via the query layer
 *    (simulating what the Phase 6 callback will eventually do — nothing in
 *    this phase's UI can set an auto status by design), reloads, and
 *    confirms the StatusDropdown trigger renders icon+text+violet-tint
 *    background, and that opening the Select exposes exactly the 6 manual
 *    options (never the 3 auto ones).
 *
 * Run data-layer only:
 *   DATABASE_URL=postgresql://postgres:devpassword@127.0.0.1:5434/opportunities \
 *     pnpm exec tsx scripts/verify-status-extension.ts
 *
 * Run data-layer + browser layer (dev server must already be up):
 *   DATABASE_URL=postgresql://postgres:devpassword@127.0.0.1:5434/opportunities \
 *     pnpm exec tsx scripts/verify-status-extension.ts http://localhost:3921
 */

const AUTO_STATUSES: ApplicationStatus[] = [
  "auto_fill_in_progress",
  "ready_to_review",
  "submitted",
];

async function verifyDataLayer() {
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

/**
 * Resolve a real, currently-visible-in-DOM opportunity to drive the browser
 * checks against. Picking a random DB row (e.g. `LIMIT 1`) is unsafe here
 * because `VirtualizedOpportunitiesTable` only mounts the visible+overscan
 * window (03-02-PLAN.md Task 3) — a row not currently on-screen simply
 * isn't in the DOM to assert against. Reading the id back out of the first
 * actually-rendered row sidesteps that entirely.
 */
async function getFirstVisibleExternalId(
  page: import("playwright").Page,
): Promise<string> {
  const firstRow = page.locator("table tbody tr[data-external-id]").first();
  await firstRow.waitFor({ state: "visible" });
  const externalId = await firstRow.getAttribute("data-external-id");
  assert.ok(externalId, "expected the first rendered row to carry a data-external-id");
  return externalId;
}

async function verifyBrowserLayer(baseUrl: string) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(120_000);
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForSelector("table");
    await page.waitForFunction(
      () =>
        document.querySelector('[role="tablist"]')?.getAttribute("tabindex") === "0",
      { timeout: 30_000 },
    );

    const externalId = await getFirstVisibleExternalId(page);
    console.log(`[info] driving browser checks against external_id ${externalId}`);

    const [existing] = await db
      .select({ status: applications.status })
      .from(applications)
      .where(eq(applications.opportunityExternalId, externalId));
    const preExisting = Boolean(existing);
    const preExistingStatus = existing?.status;

    try {
      // Simulate what the Phase 6 callback will eventually do — nothing in
      // this phase's UI can set an auto status by design.
      await upsertApplicationStatus(externalId, "submitted");
      await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
      await page.waitForSelector("table");
      await page.waitForFunction(
        () =>
          document.querySelector('[role="tablist"]')?.getAttribute("tabindex") === "0",
        { timeout: 30_000 },
      );

      const row = page.locator(`table tbody tr[data-external-id="${externalId}"]`);
      await row.scrollIntoViewIfNeeded();
      const trigger = row.getByLabel("Estado de postulación");
      await trigger.waitFor({ state: "visible" });

      // (a) trigger text + background color resolve to the accent token.
      const triggerText = (await trigger.innerText()).trim();
      assert.match(
        triggerText,
        /Enviado \(auto-apply\)/,
        `expected the trigger for ${externalId} to render "Enviado (auto-apply)", got "${triggerText}"`,
      );
      const triggerBg = await trigger.evaluate((el) => getComputedStyle(el).backgroundColor);
      const resolvedBg = await page.evaluate((color) => {
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
      }, triggerBg);
      console.log(`[info] trigger background resolved to ${resolvedBg} (raw: "${triggerBg}")`);
      assert.equal(
        resolvedBg,
        "#1e1930",
        `expected the auto-apply trigger background to resolve to the accent token #1e1930, got ${resolvedBg}`,
      );
      console.log(
        `PASS: submitted-status trigger renders "Enviado (auto-apply)" with violet-tint background #1e1930`,
      );

      // (b) open the Select, confirm exactly 6 options, none of the 3 auto
      // labels among them.
      await trigger.focus();
      await page.keyboard.press("Enter");
      await page.waitForTimeout(200);
      const options = page.getByRole("option");
      const optionCount = await options.count();
      assert.equal(
        optionCount,
        6,
        `expected exactly 6 selectable options in SelectContent, got ${optionCount}`,
      );
      const optionTexts = await options.allInnerTexts();
      console.log(`[info] visible options: ${JSON.stringify(optionTexts)}`);
      for (const forbidden of [
        "Enviado (auto-apply)",
        "Auto-fill en curso",
        "Listo para revisar",
      ]) {
        assert.ok(
          !optionTexts.some((text) => text.includes(forbidden)),
          `SelectContent must never expose "${forbidden}" as a selectable option`,
        );
      }
      console.log(
        "PASS: SelectContent exposes exactly the 6 manual options, none of the 3 auto-apply states",
      );
      await page.keyboard.press("Escape");
    } finally {
      // Restore original status, or delete the test-created row entirely.
      if (preExisting && preExistingStatus) {
        await upsertApplicationStatus(externalId, preExistingStatus as ApplicationStatus);
        console.log(`Cleanup: restored pre-existing status "${preExistingStatus}" for ${externalId}.`);
      } else if (!preExisting) {
        await db.delete(applications).where(eq(applications.opportunityExternalId, externalId));
        console.log(`Cleanup: deleted test-created applications row for ${externalId}.`);
      }
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  await verifyDataLayer();

  const baseUrl = process.argv[2];
  if (baseUrl) {
    await verifyBrowserLayer(baseUrl);
  } else {
    console.log(
      "[info] no baseUrl argument given — skipping browser layer (05-02-PLAN.md Task 2). Run again with a baseUrl (e.g. http://localhost:3921) once the dev server is up.",
    );
  }

  console.log("\nAll status-extension behaviors verified.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Status extension verification FAILED:", error);
    process.exit(1);
  });
