import { NextRequest, NextResponse } from "next/server";

import { runSync } from "@/ingestion/sync";

// pg/Drizzle require Node TCP sockets — the Edge Runtime cannot run this
// route (research/STACK.md "What NOT to Use").
export const runtime = "nodejs";

/**
 * Manual sync trigger, gated by a shared secret (threat T-01-03 /
 * research/PITFALLS.md Security Mistakes: an unauthenticated internal
 * trigger route is exploitable even in a single-user app). Calls the exact
 * same runSync() used by the cron schedule (src/jobs/scheduled-sync.ts) —
 * no duplicated ingestion logic.
 */
export async function POST(request: NextRequest) {
  const expectedSecret = process.env.SYNC_TRIGGER_SECRET;

  if (!expectedSecret) {
    console.error(
      "[api/sync] SYNC_TRIGGER_SECRET is not set — refusing all requests until configured.",
    );
    return NextResponse.json(
      { ok: false, error: "Sync trigger is not configured" },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { results } = await runSync();
  return NextResponse.json({ ok: true, results });
}
