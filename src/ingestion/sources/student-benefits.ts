import { z } from "zod";

const BENEFITS_URL =
  "https://raw.githubusercontent.com/Mapaor/student-benefits/main/benefits.json";

// Shape observed live on Mapaor/student-benefits/benefits.json. Note the
// source field is `requiresCampus` (not `campusRequired` as originally
// assumed in research/STACK.md) — this schema reflects the real upstream
// shape, confirmed by fetching the live file during Phase 1 execution.
// `url` and `hide` are present upstream but unused by this phase's schema;
// `hide` is a source-side display flag (e.g. temporarily broken benefit) and
// is intentionally NOT treated as "removed from source" for soft-delete
// purposes — a hidden-but-present entry still exists in benefits.json, so it
// is ingested as active. Surfacing `hide` in the UI is deferred to a later
// phase (no UI ships in Phase 1).
const rawBenefitSchema = z.object({
  title: z.string(),
  description: z.string().optional().default(""),
  imageSrc: z.string().optional().default(""),
  tags: z.array(z.string()).optional().default([]),
  url: z.string().optional(),
  requiresCampus: z.boolean().optional().default(false),
  hide: z.boolean().optional().default(false),
});

export type RawBenefit = z.infer<typeof rawBenefitSchema>;

export interface FetchBenefitsResult {
  rows: RawBenefit[];
  skipped: number;
}

/**
 * Fetch and validate `student-benefits/benefits.json`.
 *
 * Per CONTEXT.md/PITFALLS.md Pitfall 1: never fetch unauthenticated in
 * production. Server-side only (this module is never imported by client
 * code). GITHUB_PAT is optional at the type level so local dev without a PAT
 * yet configured degrades to an unauthenticated request instead of crashing
 * — see 01-01-SUMMARY.md for the production requirement to set GITHUB_PAT
 * before relying on frequent syncs.
 */
export async function fetchStudentBenefits(): Promise<FetchBenefitsResult> {
  const pat = process.env.GITHUB_PAT;
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (pat) {
    headers.Authorization = `Bearer ${pat}`;
  } else {
    console.warn(
      "[ingestion/student-benefits] GITHUB_PAT is not set — fetching unauthenticated. " +
        "This is only acceptable for local dev/testing; set GITHUB_PAT before relying on frequent production syncs (PITFALLS.md Pitfall 1).",
    );
  }

  const response = await fetch(BENEFITS_URL, { headers });

  if (!response.ok) {
    // Never log full response bodies / headers here — could leak
    // auth-adjacent data per threat T-01-02. Status + statusText only.
    throw new Error(
      `Failed to fetch student-benefits source: ${response.status} ${response.statusText}`,
    );
  }

  const body = await response.text();

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(body);
  } catch {
    throw new Error("student-benefits source did not return valid JSON");
  }

  if (!Array.isArray(parsedJson)) {
    throw new Error("student-benefits source did not return a JSON array");
  }

  const rows: RawBenefit[] = [];
  let skipped = 0;

  for (const entry of parsedJson) {
    const result = rawBenefitSchema.safeParse(entry);
    if (result.success) {
      rows.push(result.data);
    } else {
      skipped += 1;
      console.warn(
        "[ingestion/student-benefits] Skipping malformed entry:",
        result.error.issues.map((issue) => issue.message).join("; "),
      );
    }
  }

  return { rows, skipped };
}
