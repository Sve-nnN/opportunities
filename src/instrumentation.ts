/**
 * Next.js server-startup hook. Runs once when a new server instance starts,
 * before it handles any requests — the supported place for module-level
 * side effects like registering the ingestion cron schedule (never inside a
 * route handler, which would re-run per request).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduledSync } = await import("./jobs/scheduled-sync");
    startScheduledSync();
  }
}
