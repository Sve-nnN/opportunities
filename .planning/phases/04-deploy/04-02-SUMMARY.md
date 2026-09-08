# Phase 4 Plan 2: Production migration + secrets — Summary

**Status:** Complete
**Date:** 2026-09-08

## What was done

1. Confirmed real DATABASE_URL for the `opportunities` tenant (generated in Phase 4 setup) and confirmed the existing GITHUB_PAT (fine-grained, read-only, public, expiring) is still valid — reused, not regenerated.
2. Applied both committed Drizzle migrations to production via SSH tunnel + `pnpm db:migrate`. **Verification note:** a pre-existing, unrelated SSH tunnel on the same local port created ambiguity about which DB the migration actually reached; independently re-verified via `docker exec -i shared-postgres psql -U postgres -d opportunities -c '\dt'` directly on the VPS — confirmed all 4 tables (`applications`, `benefits`, `opportunities`, `sync_log`) exist, owned by `opportunities_user`, in the correct tenant.
3. Set `DATABASE_URL`, `GITHUB_PAT`, `SYNC_TRIGGER_SECRET` (freshly generated for production, distinct from the dev value) via `application.saveEnvironment`. Confirmed via `application.one` that all 3 keys are present — values never logged or written to any file.

## Deviations

- Port-forwarding ambiguity from an unrelated pre-existing SSH tunnel on the same local machine required an extra independent verification step (direct `docker exec` on the VPS) before trusting the migration result. No actual harm done — verified correct outcome, but flagging the process risk: local port reuse for SSH tunnels on a shared dev machine is fragile; a uniquely-numbered port should be used next time.

## Verification evidence

- `docker exec -i shared-postgres psql -U postgres -d opportunities -c '\dt'` → 4 expected tables, correct owner
- `GET application.one` → env keys present: DATABASE_URL, GITHUB_PAT, SYNC_TRIGGER_SECRET (values not logged)
