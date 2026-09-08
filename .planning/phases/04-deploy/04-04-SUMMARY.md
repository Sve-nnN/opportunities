# Phase 4 Plan 4: Domain + SSL — Summary

**Status:** Complete
**Date:** 2026-09-08

## What was done

1. Juan created the Cloudflare DNS A record for `opportunities.juan-tech.com` → `116.203.79.125`, DNS-only (grey cloud) first — confirmed resolving via `dig`.
2. Called `domain.create` on Dokploy with `certificateType: letsencrypt`. Let's Encrypt issued a valid cert within ~1 minute (Traefik HTTP-01 challenge). Confirmed via `curl -vI`: `issuer: Let's Encrypt CN=YR2`, `SSL certificate verify ok`, HTTP/2 200.
3. Juan switched Cloudflare back to proxied (orange cloud) with SSL mode Full (strict) — never Origin CA certs, per the locked decision. Confirmed live via an independent `curl` through the Cloudflare proxy: 200.
4. Juan confirmed in-browser: real data renders in all 3 tabs (Internships/Underclassmen/Benefits), freshness indicator shows a real recent timestamp.

## Verification evidence

- `dig +short opportunities.juan-tech.com` → `116.203.79.125`
- `curl -vI https://opportunities.juan-tech.com` → valid Let's Encrypt cert, HTTP/2 200
- Independent `curl` after Cloudflare proxied switch → 200
- User-confirmed: real data visible in all 3 tabs, freshness indicator accurate

## Phase 4 complete

All 3 success criteria met:
1. App runs as a Dokploy-managed Docker container ✓
2. HTTPS on `opportunities.juan-tech.com`, Full (strict) + Let's Encrypt ✓
3. Secrets (DATABASE_URL, GITHUB_PAT, SYNC_TRIGGER_SECRET) as Dokploy env vars, PAT read-only/expiring ✓

**Opportunities Hub v1 is live: https://opportunities.juan-tech.com**
