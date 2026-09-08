---
name: Opportunities Hub
description: A command-driven data tool for scanning internships, programs, and student benefits — density and keyboard speed over decoration.
colors:
  near-black-ground: "#0b0b0d"
  warm-off-white: "#e7e5e1"
  card-surface: "#131316"
  popover-surface: "#17171b"
  signal-violet: "#7c6cf6"
  violet-ink-on-signal: "#0b0b0d"
  secondary-surface: "#1a1a1f"
  secondary-ink: "#c8c6c1"
  muted-surface: "#18181c"
  muted-ink: "#9a9791"
  violet-tint-surface: "#1e1930"
  alert-red: "#f2555a"
  alert-ink-on-red: "#0b0b0d"
  hairline-border: "#232227"
typography:
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: "1.5rem"
    letterSpacing: "-0.01em"
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: "1.25rem"
    letterSpacing: "-0.01em"
  data-mono:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: "1rem"
    fontFeatureSettings: "tabular-nums"
rounded:
  sm: "4.8px"
  md: "6.4px"
  lg: "8px"
  xl: "11.2px"
  pill: "9999px"
spacing:
  xs: "0.375rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
components:
  status-pill-open:
    backgroundColor: "{colors.violet-tint-surface}"
    textColor: "{colors.warm-off-white}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  status-pill-closed:
    backgroundColor: "{colors.muted-surface}"
    textColor: "{colors.muted-ink}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  filter-chip-active:
    backgroundColor: "{colors.violet-tint-surface}"
    textColor: "{colors.warm-off-white}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  filter-chip-inactive:
    backgroundColor: "transparent"
    textColor: "{colors.muted-ink}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  search-input:
    backgroundColor: "transparent"
    textColor: "{colors.warm-off-white}"
    rounded: "{rounded.lg}"
    padding: "4px 10px"
---

# Design System: Opportunities Hub

## Overview

**Creative North Star: "The Operator's Console"**

Opportunities Hub reads as a console a keyboard-driven operator would live in for hours, not a dashboard someone glances at once — direct lineage from the Linear/Kanban dev-tool family (concept-seed FORM, seed key `a1815e08`), where speed and legibility are the entire aesthetic argument. The ground is near-black (`#0b0b0d`), never pure black, and ink is a warm off-white (`#e7e5e1`), never pure white — the pairing avoids the harsh, sterile contrast of true monochrome so a page of dense text stays readable for long sessions. One saturated violet (`#7c6cf6`) is the system's entire vocabulary of emphasis: it marks the active tab, every focus ring, and nothing else. It is rationed on purpose, so its rarity keeps doing work.

The system rejects two defaults it could easily have fallen into: a "marketing dashboard" of hero metrics, cards, and decorative icons (this product has no metrics to sell, only rows to scan); and color-only state signaling (every status, from open/closed pills to sync-failure banners, pairs an icon with a text label, never color alone — a hard accessibility floor, not a stylistic choice). Numerals are IBM Plex Mono with `tabular-nums`, so a column of counts or timestamps holds its own alignment without the eye re-parsing digit widths row to row.

**Key Characteristics:**
- Near-black ground, warm off-white ink, one rationed violet accent
- Monospace, tabular-nums for every count and timestamp
- Icon+text state indicators, never color-only
- Dense native `<table>`, sticky header, border-based rows (no zebra striping)
- Command-palette-style search (⌘K) backed by always-visible filter chips

## Colors

The palette is Restrained: neutrals carry the whole surface, and the single violet accent is reserved for exactly three jobs.

### Primary
- **Signal Violet** (`#7c6cf6`): the active tab's underline and label, every `:focus-visible` ring/outline (~5:1 measured contrast against the ground), and primary interactive affordances (active filter chips, the search input's focus border). Never used for decoration or a fourth purpose — introducing a new use of this color anywhere else dilutes the one visual signal the system has.

### Neutral
- **Near-Black Ground** (`#0b0b0d`): the app's only background. There is no light mode; this value lives directly on `:root`, not behind a media query.
- **Warm Off-White** (`#e7e5e1`): primary text (measured 15.63:1 against the ground). Warm, not cool-gray or pure white — the small blue/violet undertone keeps large blocks of body text from reading clinically.
- **Card Surface** (`#131316`) / **Popover Surface** (`#17171b`): one step up from the ground for `<table>` header stickiness and any popover-level chrome; both still read as "the same near-black world," not a distinct panel color.
- **Muted Ink** (`#9a9791`): secondary/de-emphasized text — table metadata (location, description), the Underclassmen tab's de-emphasized company names, freshness-badge timestamps. Measured 6.75:1 against the ground.
- **Secondary Surface** (`#1a1a1f`) / **Secondary Ink** (`#c8c6c1`): reserved for a secondary-emphasis surface (not yet used by a shipped component; carried forward from the initial theme for a future secondary action).
- **Muted Surface** (`#18181c`): closed/inactive status pill backgrounds.
- **Violet-Tint Surface** (`#1e1930`): open/active status pill backgrounds and active filter-chip fills — a low-saturation tint of the primary accent, not the accent itself, so pills read as "on-brand" without competing with the one true accent usage.
- **Hairline Border** (`#232227`): every table row divider, chip outline, and input border. One value, used everywhere a hairline is needed — never a second gray.

### Named Rules
**The One Accent Rule.** Signal Violet appears in exactly three roles: active tab, focus ring, primary/active interactive state. A fourth use is a bug, not a style choice.

**The Never-Color-Alone Rule.** Every state indicator (open/closed pills, the stale-sync banner, filter-chip pressed state) pairs an icon or text label with its color. A colorblind or grayscale-display reader gets the identical information as anyone else. This is a hard accessibility floor (PRODUCT.md), not negotiable per-component.

## Typography

**Body Font:** Inter (self-hosted via `next/font/google`, zero runtime Google Fonts CDN calls)
**Label/Mono Font:** IBM Plex Mono (self-hosted, weights 400/500/600)

**Character:** A geometric, workhorse UI sans paired with a technical mono for anything numeric — an intentionally unglamorous pairing for an Operate-mode tool where the type should disappear into legibility, never announce a point of view.

### Hierarchy
A deliberate compact scale — not Tailwind's defaults — every step ships its own line-height so cell text never relies on an inherited default:
- **Title** (600, `1.0625rem`/`1.5rem`): the page's own `<h1>` ("Opportunities Hub").
- **Body** (400, `0.9375rem`/`1.5rem`, tracking `-0.01em`): default running text, table cell content.
- **Label** (500, `0.8125rem`/`1.25rem`): tab labels, filter chips, table headers.
- **Small/Meta** (400, `0.75rem`/`1.1rem`): secondary annotations.
- **Data-Mono** (400, `0.6875rem`/`1rem`, `tabular-nums`): every count in parens (`(3,054)`), every "Actualizado hace Xh" timestamp. This is the system's smallest text size, by design — counts and timestamps are confirmations, not headlines.

### Named Rules
**The Tabular-Nums Rule.** Any number that appears in a column, a count badge, or a timestamp is set in the mono face with `font-variant-numeric: tabular-nums`. Digits must hold their column position; a proportional-width number in a data context is always a defect.

## Layout

Single-page, no sidebar (the direction contract's own FIRST VIEWPORT: "single-page tool, no need for nav chrome"). The page is a fixed `100dvh` column: a slim header, a top bar (tab switcher left, search + filter chips center, sync-freshness badge right), then a table that fills all remaining vertical space with its own internal scroll — the app frame itself never scrolls.

Density is the layout's whole argument: table rows are compact (no vertical padding beyond what a single line of `text-sm` needs), and the header row is `sticky` so column context survives a long scroll through thousands of rows.

**Responsive:** below desktop width, the top bar's filter-chip row is independently height-capped (`max-h-24`) and scrolls on its own axis rather than pushing the table down — a data source with an unusually large number of distinct filter values (an Underclassmen ingestion outlier: 102 raw category strings) must never be able to consume the table's viewport space. Table cells with unbounded content (Title, Location) are line-clamped to 2 lines with a fixed max-width rather than left to wrap freely — a single outlier value (e.g. a 13-city location list) must never inflate one row's height to several multiples of its neighbors and break the scanning rhythm. On narrow viewports the table itself scrolls horizontally rather than reflowing into a card layout; this keeps the same dense, spreadsheet-like reading model at every width instead of switching metaphors on mobile.

## Elevation & Depth

Flat by design. No shadow vocabulary exists anywhere in the built system — depth is conveyed entirely through tonal layering (background → card → popover, each one step lighter) and 1px hairline borders, never a blurred shadow. This matches the Operate-mode thesis: a command console has panels, not floating cards with drop shadows.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are separated by a tonal step (`#0b0b0d` → `#131316` → `#17171b`) and a hairline border, never a box-shadow. Introducing a shadow anywhere in this system is an unauthorized new depth language.

## Shapes

Corners are gently rounded, not sharp and not pill-everywhere: `0.5rem` (8px) is the base radius, scaling down to `4.8px` for the smallest controls and up to `11.2px`+ for larger containers. Status pills and filter chips are the one place radius goes fully circular (`9999px`) — reserved for small, discrete, toggleable tokens, never for a card or a table.

## Components

### Status Pill
- **Shape:** fully rounded (`9999px`), icon + text, never icon-only or text-only.
- **Open:** violet-tinted background (`#1e1930`) on warm off-white text, a filled check-circle icon.
- **Closed:** muted-surface background (`#18181c`) on muted-ink text, an x-circle icon.
- Icon always leads the text label; this ordering is fixed across every pill in the system.

### Filter Chips
- **Style:** pill-shaped toggle buttons, `aria-pressed` wired for assistive tech.
- **Active:** violet-tinted background + warm off-white text + a violet border.
- **Inactive:** transparent background, hairline border, muted-ink text; hover shifts the border to a slightly lighter neutral, never to the accent (hover previews interactivity, it does not imply selection).
- Chips are generated from live distinct data values only — a chip that would match zero rows is never rendered.

### Search Input
- **Style:** transparent background, hairline border, rounded `lg` (8px), a leading search icon.
- **Focus:** border shifts to Signal Violet, plus a full-opacity 3px violet ring (a translucent/50%-opacity ring measured below WCAG AA's 3:1 focus-indicator floor during this phase's accessibility pass — always use full opacity for a focus ring that is the sole indicator on an element with `outline-none`).
- **Command-palette entry:** a ⌘K keyboard shortcut (visualized as a `<kbd>⌘K</kbd>` hint inside the input) focuses the field from anywhere on the page — the shortcut summons the existing always-visible input rather than opening a separate overlay, so filter-chip discoverability is never traded away for the palette metaphor.

### Table
- **Style:** native `<table>`/`<thead>`/`<tbody>`/`<th scope="col">` — semantic HTML, not ARIA-role `<div>` grids.
- **Header:** `sticky top-0`, card-surface background, so column labels survive scrolling through thousands of rows.
- **Rows:** hairline-border dividers only, no zebra striping, no hover-shadow — a border is the entire row-separation vocabulary.
- **Overflow cells:** Title and Location are capped at a max-width and line-clamped to 2 lines with a trailing ellipsis; the full value is always still reachable via the row's own "Ver fuente" external link.

### Freshness Badge & Stale-Sync Banner
- **Freshness Badge:** mono, muted-ink text, "Actualizado hace Xh"/"hace Xmin" — the top bar's right-aligned confirmation that data is not stale, per-tab.
- **Stale-Sync Banner:** a full-width banner above the table, alert-red-tinted background, a warning-triangle icon plus text naming the exact failure (never a generic "something's wrong") — appears only when the active tab's source has gone stale or its last sync failed, scoped per-source so switching tabs never carries another source's warning.

### Navigation (Tabs)
- **Style:** `line` variant — no filled pill background, just a bottom underline in Signal Violet on the active tab, with the active tab's label also shifting to the accent color. Inactive tabs are muted-foreground text with no border.
- No mobile-specific tab treatment; the same horizontal tab row is used at every width.

## Do's and Don'ts

### Do:
- **Do** pair every state indicator with both an icon and a text label — color alone never carries meaning anywhere in this system.
- **Do** use IBM Plex Mono with `tabular-nums` for every number that appears in a data context (counts, timestamps).
- **Do** cap any table cell that can receive unbounded/variable-length content (a future column added to Title/Location's pattern) with a max-width and `line-clamp`, never unrestricted `whitespace-normal` wrap.
- **Do** use a fully opaque focus-ring/outline color on any element that sets `outline-none` — a translucent ring as the sole indicator has been measured to fail WCAG AA's 3:1 floor on this near-black ground.

### Don't:
- **Don't** introduce a second accent color, or a fourth use of Signal Violet beyond active-tab/focus/primary-action.
- **Don't** add a box-shadow anywhere; depth is tonal-layering + hairline-border only.
- **Don't** build a card-and-icon-tile layout for any future summary/metrics surface — this system has no hero-metric template and no decorative icon tiles; density and text carry the page.
- **Don't** let a filter-chip row (or any variable-length list fed by live/ingested data) grow unbounded — cap its height and let it scroll internally rather than pushing other content off-screen.
