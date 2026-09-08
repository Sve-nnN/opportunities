import { eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db/client";
import { applications } from "@/db/schema";
import { insertApplicationHistory } from "@/db/queries/application-history";
import { opportunityExistsByExternalId } from "@/db/queries/opportunities";
import { upsertProfileField } from "@/db/queries/profile";
import {
  AUTO_APPLY_CALLBACK_STATUSES,
  isForwardAutoApplyTransition,
} from "@/lib/application-status";
import { normalizeToKey } from "@/lib/profile-key";

// pg/Drizzle require Node TCP sockets — same reason as src/app/api/sync/route.ts
// (research/STACK.md "What NOT to Use").
export const runtime = "nodejs";

const externalIdSchema = z.string().min(1);

// T-05-01 (Phase 5 threat_model, still applicable here): `key` is
// deliberately absent — it is NEVER accepted from the client, only ever
// derived server-side via normalizeToKey(entry.label) below. Same length
// caps as app/actions/profile.ts's entrySchema.
const profileUpdateEntrySchema = z.object({
  label: z.string().trim().min(1).max(200),
  value: z.string().trim().min(1).max(2000),
  category: z.string().trim().min(1).max(200),
});

// `key` here IS accepted from the client — unlike profileUpdates, this is
// pure audit metadata (06-CONTEXT.md: "sentFields se guarda tal cual") and
// is never used to write to profile_fields.
const sentFieldEntrySchema = z.object({
  key: z.string().min(1).max(200),
  label: z.string().min(1).max(200),
  value: z.string().max(2000),
});

// T-06-02/T-06-05 (threat_model): only the 3 auto-apply statuses are
// accepted (never the 6 manual ones), and both arrays are capped at 50
// entries (06-CONTEXT.md "Cap de tamaño").
const bodySchema = z.object({
  status: z.enum(AUTO_APPLY_CALLBACK_STATUSES),
  notes: z.string().max(2000).optional(),
  profileUpdates: z.array(profileUpdateEntrySchema).max(50).optional(),
  sentFields: z.array(sentFieldEntrySchema).max(50),
});

/**
 * Thrown inside the route's single `db.transaction()` to trigger a
 * controlled rollback + 400 response — for either an invalid status
 * transition (T-06-02) or a profile-key collision (T-06-03). Deliberately
 * local to this file: nothing outside this route needs to distinguish
 * "caller sent something semantically invalid" from an unexpected
 * infrastructure failure (which falls through to the generic 500 below).
 */
class CallbackValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CallbackValidationError";
  }
}

/**
 * Bearer-secret-gated callback an external Claude Code auto-apply session
 * calls to report its result (CALLBACK-01/02, PROFILE-03, AUDIT-01/02).
 * Every write (applications.status/notes + profile_fields upserts +
 * application_history insert) happens inside ONE db.transaction() — an
 * uncaught throw anywhere inside it rolls back all three together, never
 * leaving a partial write (research/PITFALLS.md Pitfall 2, 06-CONTEXT.md
 * "Transacción atómica y semántica de escritura").
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ externalId: string }> },
) {
  const expectedSecret = process.env.AUTO_APPLY_CALLBACK_SECRET;

  if (!expectedSecret) {
    console.error(
      "[api/applications/apply-session] AUTO_APPLY_CALLBACK_SECRET is not set — refusing all requests until configured.",
    );
    return NextResponse.json(
      { ok: false, error: "Apply-session callback is not configured" },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Next.js 16: dynamic route `params` is a Promise (confirmed via Context7
  // /vercel/next.js against the installed next@16.3.4). Validate the URL
  // segment before touching request.json() — fail fast on a malformed URL,
  // same criterion as research/ARCHITECTURE.md section 4.2.
  const { externalId } = await params;
  const parsedExternalId = externalIdSchema.safeParse(externalId);
  if (!parsedExternalId.success) {
    return NextResponse.json({ ok: false, error: "Invalid externalId" }, { status: 400 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsedBody = bodySchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return NextResponse.json(
      { ok: false, error: parsedBody.error.message },
      { status: 400 },
    );
  }

  // 404 BEFORE opening any transaction — never write anything for an
  // externalId that doesn't correspond to a real opportunity
  // (06-CONTEXT.md: "no crea nada a ciegas").
  const exists = await opportunityExistsByExternalId(parsedExternalId.data);
  if (!exists) {
    return NextResponse.json({ ok: false, error: "Opportunity not found" }, { status: 404 });
  }

  try {
    await db.transaction(async (tx) => {
      // 06-REVIEW.md CR-01 (BLOCKER): reading inside a transaction under
      // Postgres's default READ COMMITTED isolation gives NO guarantee
      // against a concurrent transaction reading the same pre-write state —
      // two overlapping calls to this route for the same externalId could
      // both read a stale `currentStatus`, both pass the forward-only
      // check, and both commit (silently regressing applications.status).
      // The profile-collision check has the same read-then-write shape but
      // against the single shared profile_fields table, so it can race
      // across DIFFERENT externalIds too. Acquire both advisory locks FIRST,
      // before any read: one keyed by this externalId (serializes the
      // status-transition check/write), one on a fixed constant (serializes
      // ALL apply-session transactions that touch profile_fields, since
      // that table has no per-externalId partitioning to lock by). Both are
      // transaction-scoped (`_xact_`) — released automatically at
      // COMMIT/ROLLBACK, no manual unlock needed.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${parsedExternalId.data}))`);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(0)`);

      // Read the CURRENT status INSIDE the transaction, now serialized by
      // the advisory lock above (06-CONTEXT.md key_links).
      const [currentRow] = await tx
        .select({ status: applications.status })
        .from(applications)
        .where(eq(applications.opportunityExternalId, parsedExternalId.data));
      const currentStatus = currentRow?.status ?? null;

      if (!isForwardAutoApplyTransition(currentStatus, parsedBody.data.status)) {
        throw new CallbackValidationError(
          `Cannot transition from "${currentStatus ?? "untracked"}" to "${parsedBody.data.status}" — auto-apply statuses only advance`,
        );
      }

      await tx
        .insert(applications)
        .values({
          opportunityExternalId: parsedExternalId.data,
          status: parsedBody.data.status,
          ...(parsedBody.data.notes !== undefined ? { notes: parsedBody.data.notes } : {}),
        })
        .onConflictDoUpdate({
          target: applications.opportunityExternalId,
          set: {
            status: parsedBody.data.status,
            // Never clobber an existing notes value with undefined — only
            // set it when the caller actually sent one (matches
            // upsertApplicationNotes's condition in db/queries/applications.ts).
            ...(parsedBody.data.notes !== undefined ? { notes: parsedBody.data.notes } : {}),
            updatedAt: new Date(),
          },
        });

      const newlyLearnedKeys: string[] = [];
      for (const entry of parsedBody.data.profileUpdates ?? []) {
        const key = normalizeToKey(entry.label);
        const { collided, existingLabel } = await upsertProfileField(
          {
            key,
            label: entry.label,
            value: entry.value,
            category: entry.category,
            source: "ai_session",
          },
          tx,
        );

        if (collided) {
          // 05-REVIEW.md CR-01, extended: unlike the manual flow (which
          // overwrites and only warns), a collision here aborts the WHOLE
          // callback write — profile, status, and history together, via
          // this throw rolling back the entire transaction.
          throw new CallbackValidationError(
            `profileUpdates label "${entry.label}" collides with existing label "${existingLabel}" (both normalize to key "${key}")`,
          );
        }

        if (existingLabel === undefined) {
          newlyLearnedKeys.push(key);
        }
      }

      await insertApplicationHistory(
        {
          opportunityExternalId: parsedExternalId.data,
          status: parsedBody.data.status,
          notes: parsedBody.data.notes,
          sentFields: parsedBody.data.sentFields,
          profileUpdates: parsedBody.data.profileUpdates,
          newlyLearnedKeys,
        },
        tx,
      );
    });
  } catch (error) {
    if (error instanceof CallbackValidationError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    console.error("[api/applications/apply-session] transaction failed:", error);
    return NextResponse.json(
      { ok: false, error: "Apply-session callback failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
