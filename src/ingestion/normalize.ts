import { createHash } from "node:crypto";

import type { RawBenefit } from "./sources/student-benefits";
import type { RawInternship } from "./sources/summer-internships";
import type { RawUnderclassmenRow } from "./sources/underclassmen";

/**
 * Common shape every `opportunities`-table source normalizes into,
 * regardless of upstream format (JSON listings vs. GFM markdown tables).
 * normalize.ts remains the single place that decides this shape — sources
 * only produce their own Raw* types (research/ARCHITECTURE.md).
 */
export interface NormalizedOpportunity {
  externalId: string;
  source: string;
  title: string | null;
  company: string | null;
  location: string | null;
  category: string | null;
  roleType: string | null;
  url: string | null;
  isActive: boolean;
  postedAt: Date | null;
  raw: unknown;
  lastSeenAt: Date;
}

export interface NormalizedBenefit {
  externalId: string;
  source: string;
  title: string;
  description: string;
  imageSrc: string;
  tags: string[];
  campusRequired: boolean;
  lastSeenAt: Date;
}

/**
 * Deterministic external_id, stable across re-syncs regardless of DB row
 * id (research/ARCHITECTURE.md Pattern 2). `title` is the only field
 * guaranteed present and distinguishing across benefits.json entries —
 * confirmed no duplicate titles in the live source as of Phase 1 execution.
 */
function computeBenefitExternalId(title: string): string {
  return createHash("sha1").update(`student-benefits:${title}`).digest("hex");
}

export function normalizeBenefit(raw: RawBenefit): NormalizedBenefit {
  return {
    externalId: computeBenefitExternalId(raw.title),
    source: "student-benefits",
    title: raw.title,
    description: raw.description,
    imageSrc: raw.imageSrc,
    tags: raw.tags,
    campusRequired: raw.requiresCampus,
    lastSeenAt: new Date(),
  };
}

/**
 * Content-derived external_id for internship listings: company + title +
 * locations + url (never `active`, so a listing flipping open/closed keeps
 * the same id and just changes `is_active` — research/ARCHITECTURE.md
 * external id pattern).
 *
 * `url` is included in addition to the plan's original company+title+
 * locations formula: live-data verification during Phase 1 Plan 2 execution
 * found 1,317 groups (1,867 of 16,109 rows) sharing an identical
 * company_name+title+locations combination but with distinct `id`/`url`/
 * `date_posted` — genuinely separate postings (e.g. two different reqs for
 * "Comcast AI Research Intern" in the same location). Without `url`,
 * upsert-by-external_id would silently collapse these into a single DB row,
 * losing ~12% of real listings. Adding `url` makes the id fully unique
 * (verified: 16,109/16,109 unique) while still excluding `active`, so the
 * "same id survives open/closed toggles" guarantee is preserved.
 */
function computeInternshipExternalId(
  companyName: string,
  title: string,
  locations: string[],
  url: string,
): string {
  return createHash("sha1")
    .update(`summer2027-internships:${companyName}:${title}:${locations.join(",")}:${url}`)
    .digest("hex");
}

export function normalizeInternship(raw: RawInternship): NormalizedOpportunity {
  return {
    externalId: computeInternshipExternalId(raw.company_name, raw.title, raw.locations, raw.url),
    source: "summer2027-internships",
    title: raw.title,
    company: raw.company_name,
    location: raw.locations.join(", "),
    category: raw.category ?? null,
    // listings.json has no distinct "role type" field (SWE/PM/DS/etc. is
    // folded into `category`, e.g. "AI/ML/Data") — documented limitation,
    // not a bug. See 01-02-SUMMARY.md Decisions.
    roleType: null,
    url: raw.url,
    isActive: raw.active,
    // date_posted is unix seconds, not milliseconds (confirmed against the
    // live source: values like 1768140318 decode to 2026, not 1970+ms).
    postedAt: new Date(raw.date_posted * 1000),
    raw: raw.raw,
    lastSeenAt: new Date(),
  };
}

/**
 * Content-derived external_id for underclassmen-opportunities rows: title +
 * url (this source has no company/date field guaranteed present across all
 * 9 tables, but title+url are always present per the parser's own row
 * validation — see sources/underclassmen.ts).
 */
function computeUnderclassmenExternalId(title: string, url: string): string {
  return createHash("sha1")
    .update(`underclassmen-opportunities:${title}:${url}`)
    .digest("hex");
}

export function normalizeUnderclassmenRow(raw: RawUnderclassmenRow): NormalizedOpportunity {
  return {
    externalId: computeUnderclassmenExternalId(raw.title, raw.url),
    source: "underclassmen-opportunities",
    title: raw.title,
    company: raw.company,
    location: null,
    category: raw.category,
    // No distinct role_type column across any of the 9 tables in this
    // source — category (Type/Field/Amount/Award/Eligibility) is the
    // closest equivalent. Documented limitation, not a bug.
    roleType: null,
    url: raw.url,
    isActive: raw.isActive,
    postedAt: raw.postedAt,
    raw: raw.raw,
    lastSeenAt: new Date(),
  };
}
