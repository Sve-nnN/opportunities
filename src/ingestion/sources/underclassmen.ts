import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";

const README_URL =
  "https://raw.githubusercontent.com/Jose-Gael-Cruz-Lopez/underclassmen-opportunities/main/README.md";

export interface RawUnderclassmenRow {
  title: string;
  company: string | null;
  category: string | null;
  url: string;
  isActive: boolean;
  postedAt: Date | null;
  /** Original header + cell text for this row, kept for debugging upstream drift. */
  raw: unknown;
}

export interface FetchUnderclassmenResult {
  rows: RawUnderclassmenRow[];
  skipped: number;
}

// Column header aliases discovered by inspecting the live README during
// Phase 1 Plan 2 execution: this repo has 9 separate GFM tables (Internships,
// Programs, Ambassador Programs, Research Programs, Scholarships, HBCU,
// Women in Tech, Rising Freshmen, State-Based Scholarships), each with
// slightly different column names for the same underlying concept (e.g.
// "Company" vs "Organization" vs "University/Organization" vs "State"). The
// plan's original assumption of a single table with 3 fixed columns did not
// match the live source — this generic per-table header mapping replaces
// that assumption (still per the plan's own instruction: "do not hardcode a
// column index that assumes a fixed order").
const HEADER_ALIASES: Record<string, RegExp> = {
  status: /^status$/i,
  org: /^(company|organization|university\/organization|state)$/i,
  title: /^(role|program|opportunity|scholarship)$/i,
  category: /^(type|field|amount|award|eligibility)$/i,
  location: /^location$/i,
  application: /^application$/i,
  date: /^(date posted|deadline)$/i,
};

// Minimal mdast node shape we care about — avoids pulling in @types/mdast
// just for this one internal walker.
interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
}

function nodeToText(node: MdNode): string {
  if (node.type === "text" || node.type === "inlineCode") {
    return node.value ?? "";
  }
  if (node.type === "html") {
    // Defensively strip inline HTML (e.g. <img> badges, <br> line breaks)
    // per PITFALLS.md Pitfall 2 — degrade to plain text, never crash.
    return (node.value ?? "").replace(/<[^>]+>/g, " ");
  }
  if (node.type === "break") {
    return " ";
  }
  if (node.children) {
    return node.children.map(nodeToText).join("");
  }
  return "";
}

function cellToText(cell: MdNode): string {
  return (cell.children ?? [])
    .map(nodeToText)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract a URL from a table cell. The live README's "Application" column
 * uses raw inline HTML (`<a href="..."><img ... alt="Apply"></a>`), not
 * bracket markdown link syntax `[text](url)` — remark parses the former as
 * `html` nodes and the latter as a `link` node, so both are checked.
 */
function extractHref(cell: MdNode): string | null {
  for (const child of cell.children ?? []) {
    if (child.type === "link" && typeof child.url === "string") {
      return child.url;
    }
    if (child.type === "html" && typeof child.value === "string") {
      const match = child.value.match(/href=["']([^"']+)["']/);
      if (match) {
        return match[1];
      }
    }
    if (child.children) {
      const nested = extractHref(child);
      if (nested) {
        return nested;
      }
    }
  }
  return null;
}

function parseDate(text: string | undefined): Date | null {
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Parse the underclassmen-opportunities README markdown into normalized raw
 * rows. Exported separately from the fetch so it can be unit-verified
 * against a hand-written malformed snippet without a live network call.
 */
export function parseUnderclassmenMarkdown(markdown: string): FetchUnderclassmenResult {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown) as unknown as MdNode;

  const rows: RawUnderclassmenRow[] = [];
  let skipped = 0;

  const tables = (tree.children ?? []).filter((node) => node.type === "table");

  for (const table of tables) {
    const tableRows = table.children ?? [];
    if (tableRows.length === 0) {
      continue;
    }

    const headerRow = tableRows[0];
    const headerCells = headerRow.children ?? [];
    const headerTexts = headerCells.map(cellToText);

    const columnMap: Partial<Record<keyof typeof HEADER_ALIASES, number>> = {};
    headerTexts.forEach((text, index) => {
      for (const [field, pattern] of Object.entries(HEADER_ALIASES)) {
        if (pattern.test(text)) {
          columnMap[field as keyof typeof HEADER_ALIASES] = index;
        }
      }
    });

    // Sanity check: a table without a recognizable title-like column and an
    // Application (link) column isn't one we know how to normalize — skip
    // it entirely rather than throwing (PITFALLS.md Pitfall 2 / plan done
    // criteria).
    if (columnMap.title === undefined || columnMap.application === undefined) {
      console.warn(
        "[ingestion/underclassmen] Skipping table with unrecognized headers:",
        headerTexts,
      );
      skipped += Math.max(0, tableRows.length - 1);
      continue;
    }

    const dataRows = tableRows.slice(1);
    for (const row of dataRows) {
      const cells = row.children ?? [];

      // Column-count sanity check — a row with a different cell count than
      // its header (e.g. an escaped pipe splitting a cell) is malformed;
      // skip it, never crash the whole table walk.
      if (cells.length !== headerCells.length) {
        skipped += 1;
        console.warn(
          `[ingestion/underclassmen] Skipping row with mismatched column count (expected ${headerCells.length}, got ${cells.length})`,
        );
        continue;
      }

      const title = columnMap.title !== undefined ? cellToText(cells[columnMap.title]) : "";
      const url =
        columnMap.application !== undefined ? extractHref(cells[columnMap.application]) : null;

      if (!title || !url) {
        skipped += 1;
        console.warn(
          "[ingestion/underclassmen] Skipping row missing title or application URL:",
          cells.map(cellToText),
        );
        continue;
      }

      const statusText = columnMap.status !== undefined ? cellToText(cells[columnMap.status]) : "";
      const org = columnMap.org !== undefined ? cellToText(cells[columnMap.org]) || null : null;
      const category =
        columnMap.category !== undefined ? cellToText(cells[columnMap.category]) || null : null;
      const dateText = columnMap.date !== undefined ? cellToText(cells[columnMap.date]) : undefined;

      rows.push({
        title,
        company: org,
        category,
        url,
        // No explicit "closed" badge observed live (only OPEN / CLOSING
        // SOON / OPENS SOON as of Phase 1 Plan 2 execution) — treat anything
        // NOT literally flagged "closed" as active, so a future upstream
        // "CLOSED" badge is still respected instead of silently ignored.
        isActive: statusText ? !/closed/i.test(statusText) : true,
        postedAt: parseDate(dateText),
        raw: { header: headerTexts, cells: cells.map(cellToText) },
      });
    }
  }

  return { rows, skipped };
}

/**
 * Fetch and parse the underclassmen-opportunities README. Same PAT-aware
 * fetch pattern as Plan 1's student-benefits.ts and this plan's
 * summer-internships.ts.
 */
export async function fetchUnderclassmenOpportunities(): Promise<FetchUnderclassmenResult> {
  const pat = process.env.GITHUB_PAT;
  const headers: Record<string, string> = {
    Accept: "text/plain",
  };
  if (pat) {
    headers.Authorization = `Bearer ${pat}`;
  } else {
    console.warn(
      "[ingestion/underclassmen] GITHUB_PAT is not set — fetching unauthenticated. " +
        "This is only acceptable for local dev/testing; set GITHUB_PAT before relying on frequent production syncs (PITFALLS.md Pitfall 1).",
    );
  }

  const response = await fetch(README_URL, { headers });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch underclassmen-opportunities source: ${response.status} ${response.statusText}`,
    );
  }

  const markdown = await response.text();
  return parseUnderclassmenMarkdown(markdown);
}
