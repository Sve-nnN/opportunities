import { eq } from "drizzle-orm";

import type { Database } from "../client";
import { syncLog } from "../schema";

export async function startSyncLog(
  db: Database,
  source: string,
): Promise<number> {
  const [row] = await db
    .insert(syncLog)
    .values({
      source,
      startedAt: new Date(),
      // success stays null while the sync is running.
    })
    .returning({ id: syncLog.id });

  return row.id;
}

export interface FinishSyncLogInput {
  success: boolean;
  rowsUpserted: number;
  rowsSoftDeleted: number;
  errorMessage?: string;
}

export async function finishSyncLog(
  db: Database,
  id: number,
  input: FinishSyncLogInput,
): Promise<void> {
  await db
    .update(syncLog)
    .set({
      finishedAt: new Date(),
      success: input.success,
      rowsUpserted: input.rowsUpserted,
      rowsSoftDeleted: input.rowsSoftDeleted,
      errorMessage: input.errorMessage,
    })
    .where(eq(syncLog.id, id));
}
