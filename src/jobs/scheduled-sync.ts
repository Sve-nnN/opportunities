import cron from "node-cron";

import { runSync } from "../ingestion/sync";

let started = false;

/**
 * Registers the periodic ingestion schedule exactly once for the lifetime of
 * the server process. Must be invoked from src/instrumentation.ts (Next.js
 * 16's supported server-startup hook), never imported from a route handler
 * — importing from a route would re-register the cron on every request.
 *
 * research/ARCHITECTURE.md Pattern 1: single long-lived container, no
 * separate worker process; the identical runSync() used here is also
 * reachable from POST /api/sync (src/app/api/sync/route.ts) for a manual
 * on-demand trigger — no duplicated ingestion logic between the two.
 */
export function startScheduledSync(): void {
  if (started) {
    return;
  }
  started = true;

  // Every 2 hours. GitHub sources update at most daily; this cadence is
  // more than sufficient (research/PITFALLS.md Pitfall 3) while staying
  // well under rate limits even unauthenticated at this call volume.
  cron.schedule("0 */2 * * *", async () => {
    try {
      const result = await runSync();
      console.log("[scheduled-sync] runSync completed:", result);
    } catch (error) {
      // runSync() already isolates per-source failures into sync_log; this
      // catch is a last-resort safety net so an unexpected throw never
      // kills the cron scheduler itself.
      console.error("[scheduled-sync] runSync threw unexpectedly:", error);
    }
  });

  console.log(
    "[scheduled-sync] Cron schedule registered (every 2 hours, 0 */2 * * *)",
  );
}
