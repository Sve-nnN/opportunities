import { eq, sql } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
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
 * WR-01 (06-REVIEW.md): a plain `!==` string comparison on a bearer secret
 * short-circuits on the first differing byte, a textbook timing
 * side-channel. This route's own threat model treats its caller as more
 * adversarial than `/api/sync`'s (the interpretation of an LLM of an
 * arbitrary webpage, not Juan typing a curl by hand), so it gets the
 * constant-time comparison; `/api/sync/route.ts`'s `!==` is left as-is,
 * out of scope for this phase.
 */
function safeCompareBearer(received: string | null, expected: string): boolean {
  const expectedHeader = `Bearer ${expected}`;
  const a = Buffer.from(received ?? "");
  const b = Buffer.from(expectedHeader);
  return a.length === b.length && timingSafeEqual(a, b);
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
  if (!safeCompareBearer(authHeader, expectedSecret)) {
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

        // WR-02 (06-REVIEW.md): a label made entirely of characters outside
        // [a-z0-9] (e.g. "!!!", emoji-only) normalizes to an empty string.
        // Reachable directly from this externally-callable endpoint's
        // profileUpdates[].label — reject it before it ever reaches
        // upsertProfileField/Postgres, rather than writing a
        // semantically-meaningless empty key.
        if (key.length === 0) {
          throw new CallbackValidationError(
            `profileUpdates label "${entry.label}" does not normalize to a usable key`,
          );
        }

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
          //
          // IN-01 (06-REVIEW.md): don't echo the existing label back to the
          // caller — the calling session didn't necessarily submit that
          // value itself, and echoing it lets a caller enumerate Juan's
          // existing profile field labels by probing with guessed labels.
          // Log the specific pair server-side for debuggability instead.
          console.error(
            `[api/applications/apply-session] profileUpdates collision: new label "${entry.label}" collides with existing label "${existingLabel}" (both normalize to key "${key}")`,
          );
          throw new CallbackValidationError(
            `profileUpdates label "${entry.label}" collides with an existing profile field`,
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
