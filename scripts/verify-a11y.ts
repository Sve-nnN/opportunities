import assert from "node:assert/strict";

import { chromium } from "playwright";

/**
 * Ad hoc Playwright accessibility check for 02-03 Task 2 (same no-test-
 * framework convention as verify-filters.ts/verify-freshness.ts). Run
 * against the already-running dev server:
 *
 *   pnpm exec tsx scripts/verify-a11y.ts [baseUrl]
 *
 * Covers: keyboard walkthrough (tab order reaches every interactive
 * element, no trap), visible focus ring + measured contrast, WCAG AA
 * contrast on body/muted/accent text, native table semantics
 * (scope="col"), and the aria-live result-count region.
 */

// --- WCAG contrast helpers -------------------------------------------------

function srgbToLinear(c: number): number {
  const cs = c / 255;
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  return (
    0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
  );
}

/**
 * Tailwind v4 emits modern CSS color functions (oklab/oklch) that
 * `getComputedStyle` returns verbatim rather than normalizing to rgb() —
 * regex-matching "rgba?(...)" fails on those. Resolve ANY valid CSS color
 * string to concrete sRGB bytes by letting a real <canvas> 2D context parse
 * it (its `fillStyle` setter accepts every CSS color syntax and normalizes
 * internally) and reading the pixel back — this must run in-page, not in
 * Node, since Node has no canvas/color-parsing engine of its own.
 */
async function resolveToRgba(
  page: import("playwright").Page,
  color: string,
): Promise<[number, number, number, number]> {
  const result = await page.evaluate((c) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    // Composite over an opaque white backing first so we can recover the
    // color's own alpha by comparing against a black backing too.
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, 1, 1);
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, 1, 1);
    const onBlack = ctx.getImageData(0, 0, 1, 1).data;

    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 1, 1);
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, 1, 1);
    const onWhite = ctx.getImageData(0, 0, 1, 1).data;

    // Solve alpha + premultiplied color from two known backings:
    // result = fg*a + backing*(1-a)  =>  a = 1 - (onWhite - onBlack)/(255 - 0)
    // Using the R channel difference (any channel works if fg has no alpha
    // gradient across channels, which solid fills never do).
    const diff = onWhite[0] - onBlack[0];
    const alpha = Math.round((1 - diff / 255) * 100) / 100;
    if (alpha <= 0.001) return [onBlack[0], onBlack[1], onBlack[2], 0] as const;
    const r = (onBlack[0] - 0 * (1 - alpha)) / alpha;
    const g = (onBlack[1] - 0 * (1 - alpha)) / alpha;
    const b = (onBlack[2] - 0 * (1 - alpha)) / alpha;
    return [r, g, b, alpha] as const;
  }, color);
  return result as [number, number, number, number];
}

/** Alpha-composite `fg` (possibly translucent) over opaque `bg`. */
function compositeOver(
  fg: [number, number, number, number],
  bg: [number, number, number],
): [number, number, number] {
  const [r, g, b, a] = fg;
  return [
    r * a + bg[0] * (1 - a),
    g * a + bg[1] * (1 - a),
    b * a + bg[2] * (1 - a),
  ];
}

function contrastRatio(rgb1: [number, number, number], rgb2: [number, number, number]): number {
  const l1 = relativeLuminance(rgb1);
  const l2 = relativeLuminance(rgb2);
  const [lighter, darker] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (lighter + 0.05) / (darker + 0.05);
}

function toHex([r, g, b]: [number, number, number]): string {
  return (
    "#" +
    [r, g, b]
      .map((v) => Math.round(v).toString(16).padStart(2, "0"))
      .join("")
  );
}

async function main() {
  const baseUrl = process.argv[2] ?? "http://localhost:3921";
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(120_000);

  const navStart = Date.now();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForSelector("table");

  // The internships tab (default) renders all 16,109 rows (DISC-03: every
  // row, active and inactive, always visible — Plan 1's explicit design).
  // Those rows are static HTML with no per-row client behavior, but they
  // still sit inside the client `<Tabs>` boundary's hydration walk, which
  // measurably delays when the (much smaller) tab-switcher's roving-focus
  // group becomes keyboard-reachable. Wait for that explicit readiness
  // signal — rather than asserting on a hydration race — and report the
  // real number for the record.
  await page.waitForFunction(
    () =>
      document.querySelector('[role="tablist"]')?.getAttribute("tabindex") ===
      "0",
    { timeout: 30_000 },
  );
  const hydrationMs = Date.now() - navStart;
  console.log(
    `[info] tablist keyboard-reachable ${hydrationMs}ms after navigation start (16,109-row internships table hydrating in the same client boundary — see SUMMARY "Known Issues")`,
  );

  // --- 1. Native table semantics --------------------------------------
  const thScopes = await page.$$eval("table thead th", (ths) =>
    ths.map((th) => th.getAttribute("scope")),
  );
  assert.ok(thScopes.length > 0, "expected at least one <th> in the table header");
  assert.ok(
    thScopes.every((s) => s === "col"),
    `every header <th> should have scope="col", got: ${JSON.stringify(thScopes)}`,
  );
  console.log(`[pass] ${thScopes.length} <th scope="col"> confirmed`);

  const semantics = await page.evaluate(() => ({
    table: document.querySelectorAll("table").length,
    thead: document.querySelectorAll("thead").length,
    tbody: document.querySelectorAll("tbody").length,
  }));
  assert.ok(semantics.table > 0 && semantics.thead > 0 && semantics.tbody > 0);
  console.log("[pass] native <table>/<thead>/<tbody> confirmed");

  // --- 2. aria-live result count region --------------------------------
  const liveRegion = page.locator('[aria-live="polite"][role="status"]');
  assert.equal(await liveRegion.count(), 1, "expected exactly 1 aria-live result-count region");
  const liveText = (await liveRegion.innerText()).trim();
  assert.match(liveText, /^\d[\d,]* resultados$/, `unexpected live region text: "${liveText}"`);
  console.log(`[pass] aria-live region present: "${liveText}"`);

  // --- 3. Keyboard walkthrough: tab order + no trap --------------------
  const visitedRoles: string[] = [];
  const seenElements = new Set<string>();
  let sawSearchInput = false;
  let sawChip = false;
  let sawExternalLink = false;
  let sawTabButton = false;

  // No explicit blur()/focus() reset here: calling .blur() on body before
  // the first real keypress was empirically found (via manual Playwright
  // probing) to change Chromium's Tab-resumption point, landing one stop
  // later than a genuine fresh page load. A real user never calls blur()
  // on load, so this walkthrough starts from Playwright's untouched
  // post-navigation focus state, matching actual keyboard-only usage.
  const MAX_TABS = 40;
  for (let i = 0; i < MAX_TABS; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      return {
        tag: el.tagName,
        role: el.getAttribute("role"),
        type: (el as HTMLInputElement).type,
        id: el.id,
        text: el.textContent?.trim().slice(0, 30),
        outerKey: el.outerHTML.slice(0, 60),
      };
    });
    if (!info) continue;

    visitedRoles.push(`${info.tag}${info.role ? `[role=${info.role}]` : ""}`);
    seenElements.add(info.outerKey);

    if (info.tag === "INPUT" && info.type === "search") sawSearchInput = true;
    if (info.tag === "BUTTON" && info.text && /Abierto|Cerrado|\$|resident/.test(info.text)) {
      sawChip = true;
    }
    if (info.role === "tab") sawTabButton = true;
    if (info.tag === "A" && info.text?.includes("Ver fuente")) sawExternalLink = true;
  }

  console.log("[debug] visited sequence:", visitedRoles.join(" -> "));
  assert.ok(sawTabButton, "keyboard walkthrough never reached a tab button");
  assert.ok(sawSearchInput, "keyboard walkthrough never reached the search input");
  assert.ok(sawChip, "keyboard walkthrough never reached a filter chip");
  assert.ok(sawExternalLink, "keyboard walkthrough never reached an external 'Ver fuente' link");
  console.log(
    `[pass] keyboard walkthrough reached tabs, search, chips, and external links (${visitedRoles.length} stops, ${seenElements.size} unique elements — no full-cycle trap since unique > 1)`,
  );

  // --- 4. Visible focus ring + measured contrast -----------------------
  // Reload fresh and Tab to the first tab trigger via a REAL keypress.
  // IMPORTANT: locator.focus() (Playwright's programmatic .focus() call)
  // does NOT reliably trigger the same :focus-visible browser heuristic as
  // an actual keyboard Tab press — empirically confirmed here: the same
  // element measured ~2:1 contrast via .focus() but the correct, designed
  // 2px fully-opaque outline (~5:1) via a genuine Tab press. Every
  // measurement below Tabs to its target for that reason.
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForFunction(
    () =>
      document.querySelector('[role="tablist"]')?.getAttribute("tabindex") ===
      "0",
    { timeout: 30_000 },
  );
  await page.keyboard.press("Tab");
  const onTabButton = await page.evaluate(
    () => document.activeElement?.getAttribute("role") === "tab",
  );
  assert.ok(onTabButton, "first real Tab press should land on a tab button");

  const bg = await page.evaluate(() => {
    const bodyBg = getComputedStyle(document.body).backgroundColor;
    return bodyBg;
  });
  const [bgR, bgG, bgB] = await resolveToRgba(page, bg);

  const focusStyle = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const s = getComputedStyle(el);
    return {
      outlineColor: s.outlineColor,
      outlineWidth: s.outlineWidth,
      outlineStyle: s.outlineStyle,
      boxShadow: s.boxShadow,
      borderColor: s.borderColor,
    };
  });
  console.log("[info] tab button focus style:", focusStyle);

  // Determine the dominant focus-indicator color: prefer an actual outline;
  // otherwise fall back to border color (box-shadow rings are checked below
  // for the search input, which uses that pattern).
  let focusIndicatorRgb: [number, number, number] | null = null;
  if (focusStyle.outlineStyle !== "none" && parseFloat(focusStyle.outlineWidth) > 0) {
    const [r, g, b, a] = await resolveToRgba(page, focusStyle.outlineColor);
    focusIndicatorRgb = compositeOver([r, g, b, a], [bgR, bgG, bgB]);
  } else {
    const [r, g, b, a] = await resolveToRgba(page, focusStyle.borderColor);
    focusIndicatorRgb = compositeOver([r, g, b, a], [bgR, bgG, bgB]);
  }
  const tabFocusRatio = contrastRatio(focusIndicatorRgb, [bgR, bgG, bgB]);
  console.log(
    `[info] tab button focus indicator ${toHex(focusIndicatorRgb)} vs background ${toHex([bgR, bgG, bgB])} = ${tabFocusRatio.toFixed(2)}:1`,
  );
  assert.ok(
    tabFocusRatio >= 3,
    `tab button focus indicator contrast ${tabFocusRatio.toFixed(2)}:1 is below WCAG AA 3:1`,
  );

  // Search input: uses focus-visible:ring (box-shadow), not a hard outline.
  // Real keyboard Tab press again — not .focus() (see note above).
  await page.keyboard.press("Tab");
  const onSearchInput = await page.evaluate(
    () => (document.activeElement as HTMLInputElement)?.id === "dashboard-search",
  );
  assert.ok(onSearchInput, "second real Tab press should land on the search input");
  const searchFocusStyle = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const s = getComputedStyle(el);
    return { boxShadow: s.boxShadow, borderColor: s.borderColor, outlineStyle: s.outlineStyle };
  });
  console.log("[info] search input focus style:", searchFocusStyle);
  // box-shadow carries multiple comma-separated layers (Tailwind stacks
  // several 0-spread transparent placeholders plus the one real ring) — find
  // EVERY color-function match, resolve each, and pick the first with
  // non-zero alpha (the transparent placeholders would otherwise be picked
  // by a "first match" regex, always scoring a false 1:1 ratio).
  const shadowColorMatches = [
    ...searchFocusStyle.boxShadow.matchAll(/(?:oklab|oklch|rgba?|hsla?)\([^)]*\)/gi),
  ].map((m) => m[0]);
  assert.ok(
    shadowColorMatches.length > 0,
    "search input focus-visible should render a box-shadow ring or a visible outline",
  );
  let searchRingRgb: [number, number, number] = [bgR, bgG, bgB];
  let searchRingAlpha = 0;
  for (const candidate of shadowColorMatches) {
    const [r, g, b, a] = await resolveToRgba(page, candidate);
    if (a > 0.01) {
      searchRingRgb = compositeOver([r, g, b, a], [bgR, bgG, bgB]);
      searchRingAlpha = a;
      break;
    }
  }
  assert.ok(
    searchRingAlpha > 0.01,
    "every box-shadow layer on the focused search input was fully transparent — no visible ring",
  );
  const searchRingRatio = contrastRatio(searchRingRgb, [bgR, bgG, bgB]);
  console.log(
    `[result] search input focus ring ${toHex(searchRingRgb)} (alpha=${searchRingAlpha}) vs background ${toHex([bgR, bgG, bgB])} = ${searchRingRatio.toFixed(2)}:1 (need >= 3:1)`,
  );
  assert.ok(
    searchRingRatio >= 3,
    `search input focus ring contrast ${searchRingRatio.toFixed(2)}:1 is below WCAG AA 3:1`,
  );

  // --- 5. WCAG AA text contrast -----------------------------------------
  const textColors = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    const muted = document.querySelector(".text-muted-foreground");
    const primary = document.querySelector(".text-primary, a.text-primary");
    return {
      background: body.backgroundColor,
      foreground: body.color,
      muted: muted ? getComputedStyle(muted).color : null,
      primary: primary ? getComputedStyle(primary).color : null,
    };
  });
  console.log("[info] raw computed colors:", textColors);

  const bgRgb: [number, number, number] = [bgR, bgG, bgB];
  const fgRgb = (await resolveToRgba(page, textColors.foreground)).slice(0, 3) as [
    number,
    number,
    number,
  ];
  const bodyRatio = contrastRatio(fgRgb, bgRgb);
  console.log(
    `[result] body text ${toHex(fgRgb)} vs background ${toHex(bgRgb)} = ${bodyRatio.toFixed(2)}:1 (need >= 4.5:1)`,
  );
  assert.ok(bodyRatio >= 4.5, `body text contrast ${bodyRatio.toFixed(2)}:1 fails WCAG AA (4.5:1)`);

  if (textColors.muted) {
    const mutedRgb = (await resolveToRgba(page, textColors.muted)).slice(0, 3) as [
      number,
      number,
      number,
    ];
    const mutedRatio = contrastRatio(mutedRgb, bgRgb);
    console.log(
      `[result] muted text ${toHex(mutedRgb)} vs background ${toHex(bgRgb)} = ${mutedRatio.toFixed(2)}:1 (need >= 4.5:1)`,
    );
    assert.ok(mutedRatio >= 4.5, `muted text contrast ${mutedRatio.toFixed(2)}:1 fails WCAG AA (4.5:1)`);
  }

  if (textColors.primary) {
    const primaryRgb = (await resolveToRgba(page, textColors.primary)).slice(0, 3) as [
      number,
      number,
      number,
    ];
    const primaryRatio = contrastRatio(primaryRgb, bgRgb);
    console.log(
      `[result] violet accent text ${toHex(primaryRgb)} vs background ${toHex(bgRgb)} = ${primaryRatio.toFixed(2)}:1 (need >= 4.5:1 as text)`,
    );
    assert.ok(
      primaryRatio >= 4.5,
      `violet accent text contrast ${primaryRatio.toFixed(2)}:1 fails WCAG AA (4.5:1)`,
    );
  }

  // --- 6. Status pill / banner never color-only (structural check) ------
  const pillHasIconAndText = await page.evaluate(() => {
    const pill = document.querySelector('[class*="rounded-full"][class*="border"] svg');
    return Boolean(pill && pill.parentElement?.textContent?.trim());
  });
  assert.ok(pillHasIconAndText, "status pill should render both an icon and a text label");
  console.log("[pass] status pill icon+text confirmed");

  await browser.close();
  console.log("\nAll accessibility checks passed.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("A11Y verification FAILED:", error);
    process.exit(1);
  });
