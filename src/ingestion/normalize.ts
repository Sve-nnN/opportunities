import { createHash } from "node:crypto";

import type { RawBenefit } from "./sources/student-benefits";

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
