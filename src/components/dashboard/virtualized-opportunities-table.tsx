"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { NotesPopover } from "@/components/dashboard/notes-popover";
import { StatusDropdown } from "@/components/dashboard/status-dropdown";
import { StatusPill } from "@/components/dashboard/status-pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ApplicationRecord } from "@/db/queries/applications";
import type { listOpportunities } from "@/db/queries/opportunities";

const stickyHeadClass = "sticky top-0 z-10 bg-card";

// Uniform estimate for the virtualizer's first-pass layout math; refined per
// row via `measureElement` below since Title/Location's `line-clamp-2` means
// a 1-line vs. 2-line row differs by a few px — with 16k+ rows, even a small
// per-row drift would accumulate into a visibly wrong scrollbar/translateY
// without dynamic measurement.
const ESTIMATED_ROW_HEIGHT = 49;

type OpportunityRow = Awaited<ReturnType<typeof listOpportunities>>[number];

/**
 * Row-virtualized replacement for the pre-03-02 `OpportunitiesTable` (which
 * rendered all 16,109+ Internships rows unconditionally into the DOM at
 * once). Shared by Internships and Underclassmen (both `opportunities`-table
 * sources) — same component, `deemphasized` prop preserved from Plan 1/2.
 *
 * Virtualization technique: a real `<table>`/`<thead>`/`<tbody>`/`<tr>`/
 * `<td>` throughout — no `display: grid`/`block` override anywhere and no
 * absolutely-positioned `<tr>` (a `<tr>` cannot be reliably absolutely
 * positioned across browsers without being pulled out of the table's
 * row/column layout algorithm, and doing so risks losing its implicit
 * table-related ARIA role in some browsers — DESIGN.md "native
 * `<table>`... no ARIA-role divs"). Every rendered `<tr>` stays in normal
 * table-row flow at its natural (measured) height; the correct total
 * scroll extent is represented by two decorative `aria-hidden` spacer
 * `<tr>` rows (leading + trailing, see the `<TableBody>` block below) —
 * NOT by an explicit `height` on `<tbody>` itself, which this plan
 * originally specified but was found live to break: see the `<TableBody>`
 * comment for the measured bug and why the spacer-row technique replaces
 * it (Rule 1 deviation).
 */
export function VirtualizedOpportunitiesTable({
  rows,
  applicationsByExternalId,
  deemphasized = false,
}: {
  rows: OpportunityRow[];
  applicationsByExternalId: Map<string, ApplicationRecord>;
  deemphasized?: boolean;
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const rowElementsRef = useRef(new Map<number, HTMLTableRowElement>());
  const pendingFocusIndexRef = useRef<number | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 12,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  // Leading/trailing spacer heights (see the `<TableBody>` comment below for
  // why these replace an explicit `height` on `<tbody>` itself): `start` of
  // the first rendered row IS the height of everything scrolled past above
  // it, and `getTotalSize() - end` of the last rendered row is everything
  // still below the viewport - together with the real rows' own natural
  // heights in between, this reproduces the full scroll extent using only
  // genuine table-row layout (no explicit row-group height, no transform).
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
      : 0;

  // Clamp focusedIndex whenever the underlying row set shrinks (e.g. a new
  // search/filter narrows the table) so a stale index never points past the
  // new end of the array.
  useEffect(() => {
    setFocusedIndex((current) => Math.min(current, Math.max(rows.length - 1, 0)));
  }, [rows.length]);

  // Only actually moves DOM focus when an arrow-key/Home/End navigation
  // requested it (see `moveFocus`) - never on an incidental re-render, so
  // this can't steal focus back from a StatusDropdown/NotesPopover control
  // the user just Tabbed into inside the currently-active row.
  useEffect(() => {
    if (pendingFocusIndexRef.current === null) return;
    const targetIndex = pendingFocusIndexRef.current;
    const node = rowElementsRef.current.get(targetIndex);
    if (node) {
      node.focus();
      pendingFocusIndexRef.current = null;
    }
  });

  function moveFocus(nextIndex: number) {
    const clamped = Math.max(0, Math.min(rows.length - 1, nextIndex));
    pendingFocusIndexRef.current = clamped;
    setFocusedIndex(clamped);
    rowVirtualizer.scrollToIndex(clamped, { align: "auto" });
  }

  function handleRowKeyDown(
    event: React.KeyboardEvent<HTMLTableRowElement>,
    index: number,
  ) {
    // Roving tabindex must only react to keys pressed on the <tr> itself,
    // never to ArrowUp/Down/Home/End bubbling up from a StatusDropdown's
    // open Select (Radix renders it in a Portal, but React re-dispatches
    // synthetic events along the *component* tree, so a key press inside
    // that portal still bubbles here as a React event) - without this
    // guard, navigating Select options with arrow keys would ALSO move the
    // row focus underneath it.
    if (event.target !== event.currentTarget) return;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveFocus(index + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveFocus(index - 1);
        break;
      case "Home":
        event.preventDefault();
        moveFocus(0);
        break;
      case "End":
        event.preventDefault();
        moveFocus(rows.length - 1);
        break;
      default:
        break;
    }
  }

  if (rows.length === 0) {
    return (
      <div className="min-h-0 flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <HeaderRow />
          </TableHeader>
          <TableBody>
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={6}
                className="py-10 text-center text-muted-foreground"
              >
                No se encontraron resultados con estos filtros.
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-auto">
      {/*
        `table-fixed`: with only ~20-30 of 16,109+ rows ever mounted at
        once, the browser's default auto-layout column-width algorithm
        (which considers every rendered cell across the WHOLE table, not
        per row-group) would recompute widths from whichever rows happen
        to be in the DOM at a given scroll position - causing visible
        column-width jitter as different rows scroll in/out. Fixed layout
        derives widths once from the header row's own explicit widths
        (see HeaderRow below) and ignores body content entirely.
      */}
      <Table className="table-fixed">
        <TableHeader>
          <HeaderRow />
        </TableHeader>
        {/*
          `<tbody>` keeps its default `table-row-group` display AND no
          explicit height (never overridden to `block`/`grid`/a fixed
          height) so `<thead>`/`<tbody>`/`<tr>` all stay in ONE shared
          table layout/column-alignment context.

          DEVIATION from this plan's literal wording (Rule 1 - bug fix):
          the plan named "altura total del <tbody> fijada por
          getTotalSize()" as the technique, matching TanStack Virtual's own
          docs description for their table example. Implemented and
          measured live: giving a table-row-group an explicit height far
          larger than its ~13 real rows' natural content causes browsers to
          apply the CSS table height-distribution algorithm and STRETCH
          those few real rows to fill the excess space - measured at
          ~2,457,670px per row (single-row heights, not a total) in this
          exact build, which then fed back into `measureElement` and
          spiraled the virtualizer's own total size into the tens of
          millions of pixels. This is a real, disqualifying rendering bug,
          not a cosmetic issue - it broke scroll position and roving
          keyboard navigation (End could no longer resolve a valid index).
          Fixed by using explicit leading/trailing spacer `<tr>` elements
          instead (below) - the standard, well-supported technique for
          giving a virtualized real `<table>` its correct total scroll
          height without redistributing space onto real content rows.
        */}
        <TableBody>
          {paddingTop > 0 && (
            <tr aria-hidden="true">
              <td
                colSpan={6}
                style={{ height: `${paddingTop}px`, padding: 0, border: "none" }}
              />
            </tr>
          )}
          {virtualRows.map((virtualRow) => {
            const row = rows[virtualRow.index];
            const record = applicationsByExternalId.get(row.externalId);
            return (
              <TableRow
                key={row.externalId}
                data-external-id={row.externalId}
                data-row-index={virtualRow.index}
                // `data-index` + `measureElement`: TanStack Virtual's
                // dynamic-measurement convention (docs/api/virtualizer.md).
                // Title/Location's `line-clamp-2` means some rows are 1
                // line tall and some 2 - without this, every row would be
                // forced to the uniform `estimateSize` and either clip
                // 2-line content or leave a gap.
                data-index={virtualRow.index}
                ref={(node) => {
                  if (node) {
                    rowElementsRef.current.set(virtualRow.index, node);
                    rowVirtualizer.measureElement(node);
                  } else {
                    rowElementsRef.current.delete(virtualRow.index);
                  }
                }}
                tabIndex={focusedIndex === virtualRow.index ? 0 : -1}
                onFocus={() => setFocusedIndex(virtualRow.index)}
                onKeyDown={(event) => handleRowKeyDown(event, virtualRow.index)}
                className="outline-none focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <TableCell
                  className={
                    deemphasized
                      ? "whitespace-normal text-muted-foreground"
                      : "font-medium whitespace-normal"
                  }
                >
                  {row.company ?? "—"}
                </TableCell>
                <TableCell className="max-w-xs whitespace-normal">
                  <div className="line-clamp-2">{row.title ?? "—"}</div>
                </TableCell>
                <TableCell className="max-w-40 whitespace-normal text-muted-foreground">
                  <div className="line-clamp-2">{row.location ?? "—"}</div>
                </TableCell>
                <TableCell>
                  <StatusPill isActive={row.isActive} />
                </TableCell>
                <TableCell>
                  {/*
                    `tabIndex={-1}` on every OTHER mounted row's controls:
                    real roving-tabindex excludes a group's non-active
                    members (AND their descendants) from the normal Tab
                    sequence entirely, so Tab enters the table exactly once
                    (landing on whichever row is currently active) and
                    exits exactly once - never stepping through every
                    visible+overscan row's StatusDropdown/NotesPopover one
                    by one. Arrow keys (handleRowKeyDown above) remain the
                    only way to move between rows.
                  */}
                  <div className="flex items-center gap-1">
                    <StatusDropdown
                      opportunityExternalId={row.externalId}
                      status={record?.status ?? "not_applied"}
                      tabIndex={focusedIndex === virtualRow.index ? undefined : -1}
                    />
                    <NotesPopover
                      opportunityExternalId={row.externalId}
                      notes={record?.notes ?? null}
                      tabIndex={focusedIndex === virtualRow.index ? undefined : -1}
                    />
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  {row.url ? (
                    <a
                      href={row.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary underline underline-offset-4"
                    >
                      Ver fuente
                      <ExternalLink aria-hidden="true" className="size-3.5" />
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
          {paddingBottom > 0 && (
            <tr aria-hidden="true">
              <td
                colSpan={6}
                style={{ height: `${paddingBottom}px`, padding: 0, border: "none" }}
              />
            </tr>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function HeaderRow() {
  // Explicit widths (summing to 100%): with `table-fixed` on the parent
  // <table>, column widths are derived ONLY from this header row's cells,
  // never recomputed per visible tbody row (see VirtualizedOpportunitiesTable
  // comment) - these proportions approximate the previous auto-layout
  // result so the visual column balance doesn't shift noticeably.
  return (
    <TableRow className="hover:bg-transparent">
      <TableHead scope="col" className={`${stickyHeadClass} w-[16%]`}>
        Company
      </TableHead>
      <TableHead scope="col" className={`${stickyHeadClass} w-[28%]`}>
        Title
      </TableHead>
      <TableHead scope="col" className={`${stickyHeadClass} w-[18%]`}>
        Location
      </TableHead>
      <TableHead scope="col" className={`${stickyHeadClass} w-[10%]`}>
        Status
      </TableHead>
      <TableHead scope="col" className={`${stickyHeadClass} w-[18%]`}>
        Postulación
      </TableHead>
      <TableHead scope="col" className={`${stickyHeadClass} w-[10%] text-right`}>
        Link
      </TableHead>
    </TableRow>
  );
}
