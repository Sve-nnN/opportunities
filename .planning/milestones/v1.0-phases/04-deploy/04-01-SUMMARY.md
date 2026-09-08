# Phase 4 Plan 1: Docker verify + GitHub push + Dokploy project/app — Summary

**Status:** Complete
**Date:** 2026-09-08

## What was built

1. **Dockerfile fix (real bug found)**: `pnpm build` failed inside Docker because Next.js's page-data-collection step imports every route module at build time — including `src/db/client.ts`, which throws if `DATABASE_URL` is unset, even though `/` is `force-dynamic` and never queries the DB at build time. Fixed by adding a placeholder `ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"` in the builder stage only (never baked into the runner image; Dokploy injects the real value at runtime).
2. Verified locally: `docker build` succeeds, container starts, serves `/` (200) and a real static chunk under `/_next/static/chunks/` (200, immutable cache headers) — no reverse proxy needed for static assets to resolve correctly.
3. Pushed the repo to a new public GitHub repo: `https://github.com/Sve-nnN/opportunities` (master branch).
4. Created Dokploy project `opportunities` (`projectId: AR-Y1s3JnJwxEdzqUnCde`) and application `opportunities` (`applicationId: TMd8jbrMBG2sbwscwEnAd`), wired to the GitHub repo via `application.saveGitProvider`, with `buildType: dockerfile` via `application.saveBuildType`. Confirmed live via `application.one` GET (not just trusting the POST responses).

## Key IDs for next plans

- `environmentId`: `LFBBOMb9QrkLUhIBtjsR1`
- `applicationId`: `TMd8jbrMBG2sbwscwEnAd`
- GitHub repo: `https://github.com/Sve-nnN/opportunities`

## Deviations

- Dockerfile required a real fix (build-time DATABASE_URL placeholder) not anticipated in the plan — documented above, commit `aca6ecb`.

## Verification evidence

- `docker build -t opportunities:local .` — succeeds after fix
- Local container: `curl -sI http://localhost:3010/` → 200; real static chunk → 200 with `Cache-Control: public, max-age=31536000, immutable`
- `git ls-remote origin master` confirms push
- `GET application.one?applicationId=TMd8jbrMBG2sbwscwEnAd` → `buildType:"dockerfile"`, `dockerfile:"Dockerfile"`, `customGitUrl` matches pushed repo
