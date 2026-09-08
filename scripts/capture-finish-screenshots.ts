import { chromium } from "playwright";

/**
 * One-off capture for the Impeccable finish flow (02-03 Task 3, code-led
 * path per reference/new-work.md section 7): desktop.png (1440w, full page)
 * and mobile.png (390w) into .impeccable/review/, against the real
 * production standalone build with live Postgres data.
 */
async function main() {
  const baseUrl = process.argv[2] ?? "http://localhost:3922";
  const browser = await chromium.launch();

  // Desktop: 1440 wide, full page.
  const desktopPage = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  await desktopPage.goto(baseUrl, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  // Wait for real content (table rows), not a skeleton/shimmer frame.
  await desktopPage.waitForSelector("table tbody tr td");
  await desktopPage.waitForFunction(
    () =>
      document.querySelector('[role="tablist"]')?.getAttribute("tabindex") ===
      "0",
    { timeout: 30_000 },
  );
  await desktopPage.waitForTimeout(300);
  await desktopPage.screenshot({
    path: ".impeccable/review/desktop.png",
    fullPage: true,
  });
  console.log("desktop.png captured");
  await desktopPage.close();

  // Mobile: 390 wide, full page.
  const mobilePage = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  await mobilePage.goto(baseUrl, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  await mobilePage.waitForSelector("table tbody tr td");
  await mobilePage.waitForTimeout(500);
  await mobilePage.screenshot({
    path: ".impeccable/review/mobile.png",
    fullPage: true,
  });
  console.log("mobile.png captured");
  await mobilePage.close();

  await browser.close();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Screenshot capture FAILED:", error);
    process.exit(1);
  });
