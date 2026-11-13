# Deployment — ON Mission 16.116.0

1. Use Node 24.22.1 and npm 10.9.2 (matching the Cloudflare build environment).
2. Install with `npm ci`.
3. Run `npm run check:release`, `npm run check:health`, `npm run check:migrations`, `npm run check:schema`, `npm run check:release-engineering`, and `npm run build`.
4. Deploy to staging first. Confirm migration 0175 is applied; this release adds no migration.
5. Verify `/api/platform/public/defaults`, `/api/platform/public/classify-onboarding`, and `/api/platform/public/intakes`.
6. Verify identical intake retries return the same intake; reusing an idempotency key with different data returns HTTP 409.
7. Verify country/sector/product package resolution and provenance. Confirm attempted security-invariant weakening fails closed.
8. Test all protected mission mutations, tenant isolation, audit and recovery independently; the new resolver is not yet a universal authorization authority.
9. Promote through the normal Cloudflare release pipeline only after staging acceptance.

Deployment is not evidence of migration application, runtime correctness, country certification, or user acceptance. Preserve D1 data and migration history; never reset production databases.
