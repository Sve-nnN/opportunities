import { db } from "@/db/client";
import { applicationHistory } from "@/db/schema";

/**
 * Same structural-executor trick as `upsertProfileField`
 * (`src/db/queries/profile.ts`) — derived from `db.transaction`'s own
 * callback parameter type so the Phase 6 apply-session route can pass its
 * `tx` handle here without a hand-typed, version-fragile generic.
 */
type TransactionCallback = Parameters<typeof db.transaction>[0];
type Transaction = Parameters<TransactionCallback>[0];
type Executor = typeof db | Transaction;

export interface InsertApplicationHistoryInput {
  opportunityExternalId: string;
  /** One of AUTO_APPLY_CALLBACK_STATUSES (src/lib/application-status.ts). */
  status: string;
  notes?: string;
  /** The `{key,label,value}[]` array exactly as received, unmodified. */
  sentFields: unknown;
  /** The raw `{label,value,category}[]` array as received, if any. */
  profileUpdates?: unknown;
  /** Computed server-side by the route, never trusted from the client. */
  newlyLearnedKeys: string[];
}

/**
 * Plain insert — NEVER an upsert, unlike `applications`/`profileFields`.
 * Every call to the Phase 6 callback route appends a new row (06-CONTEXT.md:
 * "Una fila nueva por cada llamada al endpoint... nunca reemplaza una
 * anterior"). `executor` defaults to the top-level `db` but the route
 * always passes its `tx` handle so this insert lands inside the same
 * all-or-nothing transaction as the `applications` upsert and any
 * `profileFields` upserts for that call.
 */
export async function insertApplicationHistory(
  input: InsertApplicationHistoryInput,
  executor: Executor = db,
): Promise<void> {
  await executor.insert(applicationHistory).values({
    opportunityExternalId: input.opportunityExternalId,
    status: input.status,
    notes: input.notes ?? null,
    sentFields: input.sentFields,
    profileUpdates: input.profileUpdates ?? null,
    newlyLearnedKeys: input.newlyLearnedKeys,
  });
}
