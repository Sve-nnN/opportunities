import { z } from "zod";

const BRANCHES_TO_TRY = ["dev", "main"];
const LISTINGS_PATH = ".github/scripts/listings.json";

function listingsUrl(branch: string): string {
  return `https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/${branch}/${LISTINGS_PATH}`;
}

/**
 * Shape observed live on SimplifyJobs/Summer2027-Internships'
 * `.github/scripts/listings.json` (the same JSON the README table is
 * generated from — never parse the rendered README per PITFALLS.md
 * Pitfall 2). Confirmed live during Phase 1 Plan 2 execution: 16,109
 * entries, 0 missing required fields. `.passthrough()` keeps any
 * additional/unknown fields (e.g. `terms`, `degrees`, `sponsorship`,
 * `is_visible`) instead of failing validation on upstream JSON evolving —
 * those extra fields are preserved separately in the row's `raw` object.
 */
const rawInternshipSchema = z
  .object({
    company_name: z.string(),
    title: z.string(),
    locations: z.array(z.string()),
    date_posted: z.number(),
    active: z.boolean(),
    url: z.string(),
    category: z.string().optional(),
  })
  .passthrough();

export interface RawInternship {
  company_name: string;
  title: string;
  locations: string[];
  date_posted: number;
  active: boolean;
  url: string;
  category?: string;
  /** Original parsed JSON entry, including any pass-through fields. */
  raw: unknown;
}

export interface FetchInternshipsResult {
  rows: RawInternship[];
  skipped: number;
}

/**
 * Fetch and validate SimplifyJobs/Summer2027-Internships' `listings.json`.
 *
 * Same PAT-aware fetch pattern as student-benefits.ts (Plan 1). Tries the
 * `dev` branch first (confirmed live as of Phase 1 Plan 2 execution), falls
 * back to `main` if that 404s — SimplifyJobs' branch naming has changed
 * across seasons in prior years (per PITFALLS.md), so this fallback is
 * cheap insurance against a future rename.
 */
export async function fetchSummerInternships(): Promise<FetchInternshipsResult> {
  const pat = process.env.GITHUB_PAT;
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (pat) {
    headers.Authorization = `Bearer ${pat}`;
  } else {
    console.warn(
      "[ingestion/summer-internships] GITHUB_PAT is not set — fetching unauthenticated. " +
        "This is only acceptable for local dev/testing; set GITHUB_PAT before relying on frequent production syncs (PITFALLS.md Pitfall 1).",
    );
  }

  let response: Response | undefined;
  let lastError: string | undefined;

  for (const branch of BRANCHES_TO_TRY) {
    const candidate = await fetch(listingsUrl(branch), { headers });
    if (candidate.ok) {
      response = candidate;
      break;
    }
    lastError = `${candidate.status} ${candidate.statusText} (branch: ${branch})`;
  }

  if (!response) {
    throw new Error(
      `Failed to fetch summer2027-internships listings.json from any known branch: ${lastError}`,
    );
  }

  const body = await response.text();

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(body);
  } catch {
    throw new Error("summer2027-internships source did not return valid JSON");
  }

  if (!Array.isArray(parsedJson)) {
    throw new Error("summer2027-internships source did not return a JSON array");
  }

  const rows: RawInternship[] = [];
  let skipped = 0;

  for (const entry of parsedJson) {
    const result = rawInternshipSchema.safeParse(entry);
    if (result.success) {
      rows.push({ ...result.data, raw: entry });
    } else {
      skipped += 1;
      console.warn(
        "[ingestion/summer-internships] Skipping malformed entry:",
        result.error.issues.map((issue) => issue.message).join("; "),
      );
    }
  }

  return { rows, skipped };
}
