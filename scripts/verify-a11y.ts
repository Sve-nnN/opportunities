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

  // Warm-up request BEFORE the timed navigation below (Rule 1 fix, found
  // live running this script standalone): an idle `next dev` (Turbopack)
  // process answers its first request after a gap in several seconds
  // (measured live: ~8s cold vs. ~0.3-0.4s once warm — Postgres pool
  // reconnect + on-demand route compile, neither of which is what the
  // `hydrationMs` assertion below is meant to catch). Without this, the
  // timed measurement conflates that one-time cold-start cost with actual
  // hydration time, producing a false regression signal unrelated to
  // dataset size or this plan's changes.
  await fetch(baseUrl).catch(() => {});

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(120_000);

  const navStart = Date.now();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForSelector("table");

  // The internships tab (default) has 16,109+ rows in its dataset, but as
  // of 03-02-PLAN.md Task 3 (`VirtualizedOpportunitiesTable`,
  // `@tanstack/react-virtual`) only the visible+overscan rows (~13-30) are
  // ever mounted in the DOM at once - the tab-switcher's roving-focus group
  // no longer competes with a 16k-row hydration walk in the same client
  // boundary. This must now be CONSTANT regardless of dataset size (never
  // scaling with row count again), not just an informational number - the
  // 02-03-SUMMARY.md-documented regression was 6000-13000ms before
  // virtualization; a few hundred ms of this remaining number is the
  // server-side Postgres round-trip (6 queries via Promise.all in
  // page.tsx), which is orthogonal to virtualization and won't hit 0.
  await page.waitForFunction(
    () =>
      document.querySelector('[role="tablist"]')?.getAttribute("tabindex") ===
      "0",
    { timeout: 30_000 },
  );
  const hydrationMs = Date.now() - navStart;
  console.log(
    `[result] tablist keyboard-reachable ${hydrationMs}ms after navigation start (was 6000-13000ms pre-virtualization, 02-03-SUMMARY.md "Known Issues" / 03-02-PLAN.md must_haves) - constant regardless of the 16,109+-row Internships dataset size, since only the visible rows are ever mounted`,
  );
  assert.ok(
    hydrationMs < 3000,
    `expected a small, roughly-constant time (server round-trip + a handful of mounted rows), not scaling toward the old 6000-13000ms figure; got ${hydrationMs}ms`,
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
  // TabsTrigger has `transition-all`, which includes `outline-color` - wait
  // for it to settle before measuring, otherwise this can catch an
  // interpolated (and therefore not-actually-representative) mid-animation
  // color a few ms into the transition.
  await page.waitForTimeout(200);
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

  // --- 7. Row virtualization: DOM node count genuinely reduced -----------
  // (03-02-PLAN.md Task 3) The dataset has 16,109+ Internships rows;
  // pre-virtualization every single one was mounted in the DOM at once.
  // `@tanstack/react-virtual` should only ever mount the visible+overscan
  // window regardless of scroll position or total dataset size.
  const mountedRowCount = await page.$$eval(
    "table tbody tr[data-external-id]",
    (trs) => trs.length,
  );
  console.log(
    `[result] mounted <tr data-external-id> count: ${mountedRowCount} (dataset has 16,109+ Internships rows - before virtualization, ALL of them were mounted; this table's own <tbody> reports height=${await page.$eval("table tbody", (tb) => (tb as HTMLElement).style.height)} to represent the full scrollable extent)`,
  );
  assert.ok(
    mountedRowCount > 0 && mountedRowCount < 100,
    `expected far fewer than 16,109 mounted rows (virtualized), got ${mountedRowCount}`,
  );

  // --- 8. Roving tabindex: ArrowUp/Down/Home/End move focus between rows -
  const firstRow = page.locator("table tbody tr[data-external-id]").first();
  await firstRow.focus();
  const initialRowIndex = await page.evaluate(() =>
    document.activeElement?.getAttribute("data-row-index"),
  );
  assert.equal(initialRowIndex, "0", "expected direct .focus() to land on row index 0");

  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(150);
  const rowIndexAfterDown = await page.evaluate(() =>
    document.activeElement?.getAttribute("data-row-index"),
  );
  assert.equal(rowIndexAfterDown, "1", "ArrowDown should move roving-tabindex focus to row index 1");

  await page.keyboard.press("End");
  let rowIndexAfterEnd: string | null | undefined = null;
  for (let attempt = 0; attempt < 15; attempt++) {
    await page.waitForTimeout(200);
    const current = await page.evaluate(() =>
      document.activeElement?.getAttribute("data-row-index"),
    );
    if (current && current !== rowIndexAfterEnd) {
      rowIndexAfterEnd = current;
    } else if (rowIndexAfterEnd !== null) {
      // Settled: same index 2 polls in a row after it first changed.
      break;
    }
  }
  assert.ok(
    rowIndexAfterEnd !== null && Number(rowIndexAfterEnd) > 1,
    `End should move roving-tabindex focus well past row index 1, got ${rowIndexAfterEnd}`,
  );
  // DEVIATION (Rule 1 — bug fix, found live running this script standalone):
  // the plan/comment this replaced asserted `> 1000`, a leftover expectation
  // from before Phase 4 (04-05-PLAN.md) added real Postgres LIMIT/OFFSET
  // pagination — `rows.length` passed into VirtualizedOpportunitiesTable is
  // now capped at PAGE_SIZE (100 in src/app/page.tsx), never the full
  // 16,109+-row dataset, so "> 1000" can never pass again regardless of
  // correctness. Proving End reached the TRUE last row (not just "some
  // large number") without hardcoding the current page size: a further
  // ArrowDown past End must stay clamped at the same index.
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(200);
  const rowIndexAfterExtraDown = await page.evaluate(() =>
    document.activeElement?.getAttribute("data-row-index"),
  );
  assert.equal(
    rowIndexAfterExtraDown,
    rowIndexAfterEnd,
    "ArrowDown pressed again after End should stay clamped at the same (last) row index, proving End reached the true end of the current page's rows",
  );

  await page.keyboard.press("Home");
  await page.waitForTimeout(500);
  const rowIndexAfterHome = await page.evaluate(() =>
    document.activeElement?.getAttribute("data-row-index"),
  );
  assert.equal(rowIndexAfterHome, "0", "Home should return roving-tabindex focus to row index 0");
  console.log(
    `[pass] roving tabindex: .focus()->0, ArrowDown->1, End->${rowIndexAfterEnd}, Home->0`,
  );

  // --- 9. Full in-row keyboard walkthrough: StatusDropdown + NotesPopover,
  // no focus trap anywhere in the sequence (03-02-PLAN.md Task 3 "done") --
  await page.keyboard.press("Tab"); // row -> StatusDropdown trigger
  const onStatusTrigger = await page.evaluate(
    () => document.activeElement?.getAttribute("aria-label") === "Estado de postulación",
  );
  assert.ok(onStatusTrigger, "Tab from the focused row should reach the StatusDropdown trigger next");

  await page.keyboard.press("Enter"); // open the Select
  await page.waitForTimeout(150);
  const selectOpen = await page.getByRole("option", { name: /Aplicado/i }).isVisible();
  assert.ok(selectOpen, "Enter on the StatusDropdown trigger should open the Select options");

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter"); // choose an option, closes the Select
  // `updateApplicationStatus`'s `revalidatePath` refresh lands ~100-400ms
  // AFTER the Server Action call resolves (StatusDropdown's own defensive
  // re-focus polls this same window) - poll here too rather than a single
  // fixed wait, since checking too early would misreport a transient state.
  let afterSelectClose = { tag: undefined as string | undefined, visible: false };
  for (let attempt = 0; attempt < 8; attempt++) {
    await page.waitForTimeout(100);
    afterSelectClose = await page.evaluate(() => ({
      tag: document.activeElement?.tagName,
      visible: document.activeElement
        ? (document.activeElement as HTMLElement).offsetParent !== null
        : false,
    }));
    if (afterSelectClose.tag && afterSelectClose.tag !== "BODY") break;
  }
  assert.ok(
    afterSelectClose.tag && afterSelectClose.tag !== "BODY",
    "focus must not fall back to <body> after closing the Select with Enter (focus trap/loss check)",
  );
  assert.ok(afterSelectClose.visible, "the element focused after closing the Select must be visible");
  console.log("[pass] StatusDropdown operable with arrows+Enter, focus lands on a visible element after close");

  await page.keyboard.press("Tab"); // StatusDropdown trigger -> NotesPopover button
  const onNotesTrigger = await page.evaluate(() =>
    (document.activeElement?.getAttribute("aria-label") ?? "").toLowerCase().includes("nota"),
  );
  assert.ok(onNotesTrigger, "Tab from the StatusDropdown should reach the NotesPopover trigger next");

  await page.keyboard.press("Enter"); // open the notes popover
  await page.waitForTimeout(150);
  const textareaVisible = await page.locator("textarea").isVisible();
  assert.ok(textareaVisible, "Enter on the NotesPopover trigger should open the popover with a textarea");

  await page.keyboard.press("Tab"); // popover trigger -> textarea (Radix auto-focuses content, but confirm reachable)
  await page.keyboard.type("verificación de teclado a11y");
  await page.keyboard.press("Escape"); // close, must return focus to the trigger button
  await page.waitForTimeout(300);
  const afterPopoverClose = await page.evaluate(() => ({
    tag: document.activeElement?.tagName,
    ariaLabel: document.activeElement?.getAttribute("aria-label"),
    visible: document.activeElement
      ? (document.activeElement as HTMLElement).offsetParent !== null
      : false,
  }));
  const textareaStillOpen = await page.locator("textarea").count();
  assert.equal(textareaStillOpen, 0, "Escape should close the NotesPopover");
  assert.ok(
    afterPopoverClose.tag && afterPopoverClose.tag !== "BODY",
    "focus must not fall back to <body> after closing the NotesPopover with Escape (focus trap/loss check)",
  );
  assert.ok(afterPopoverClose.visible, "the element focused after closing the NotesPopover must be visible");
  console.log(
    `[pass] NotesPopover operable with Enter to open, Escape to close, focus returned to <${afterPopoverClose.tag} aria-label="${afterPopoverClose.ariaLabel}"> (no trap, no loss)`,
  );

  // --- 10. SendToAiButton (07-02-PLAN.md Task 3): same focused row, one
  // more Tab stop after NotesPopover, Enter opens, Escape closes without a
  // focus trap or focus loss ---------------------------------------------
  await page.keyboard.press("Tab"); // NotesPopover trigger -> SendToAiButton trigger
  const sendToAiLabel = await page.evaluate(
    () => document.activeElement?.getAttribute("aria-label") ?? "",
  );
  assert.ok(
    sendToAiLabel === "Send to AI" ||
      sendToAiLabel === "Reenviar prompt" ||
      sendToAiLabel.includes("sin link de aplicación"),
    `Tab from the NotesPopover should reach the SendToAiButton trigger next, got aria-label="${sendToAiLabel}"`,
  );
  console.log(`[pass] Tab from NotesPopover reached the SendToAiButton trigger (aria-label="${sendToAiLabel}")`);

  await page.keyboard.press("Enter"); // open the Send to AI popover
  await page.waitForTimeout(300);
  const sendToAiPopoverContent = await page.evaluate(() => {
    const live = document.querySelector('[aria-live="polite"]');
    const alertEl = document.querySelector('[role="alert"]');
    return {
      hasLive: Boolean(live && live.textContent?.trim()),
      hasAlert: Boolean(alertEl && alertEl.textContent?.trim()),
    };
  });
  assert.ok(
    sendToAiPopoverContent.hasLive || sendToAiPopoverContent.hasAlert,
    "Enter on the SendToAiButton trigger should open a popover with either an aria-live status or a role=alert error (any of the 4 states is valid)",
  );
  console.log(
    `[pass] SendToAiButton popover opened with real content (aria-live=${sendToAiPopoverContent.hasLive}, role=alert=${sendToAiPopoverContent.hasAlert})`,
  );

  await page.keyboard.press("Escape"); // close, must return focus to the trigger without a trap
  await page.waitForTimeout(300);
  const afterSendToAiClose = await page.evaluate(() => ({
    tag: document.activeElement?.tagName,
    ariaLabel: document.activeElement?.getAttribute("aria-label"),
    visible: document.activeElement
      ? (document.activeElement as HTMLElement).offsetParent !== null
      : false,
  }));
  assert.ok(
    afterSendToAiClose.tag && afterSendToAiClose.tag !== "BODY",
    "focus must not fall back to <body> after closing the SendToAiButton popover with Escape (focus trap/loss check)",
  );
  assert.ok(afterSendToAiClose.visible, "the element focused after closing the SendToAiButton popover must be visible");
  console.log(
    `[pass] SendToAiButton popover operable with Enter to open, Escape to close, focus returned to <${afterSendToAiClose.tag} aria-label="${afterSendToAiClose.ariaLabel}"> (no trap, no loss)`,
  );

  await browser.close();
  console.log("\nAll accessibility checks passed.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("A11Y verification FAILED:", error);
    process.exit(1);
  });
