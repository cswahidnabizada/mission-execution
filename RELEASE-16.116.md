# ON Mission 16.116.0 — Governed Universal Configuration Resolution

## Release intent

Continue the universal-platform foundation cumulatively. Resolve the effective published configuration from the global default and optional country, sector, and product packages while preserving non-overridable security invariants. Harden public onboarding intake idempotency.

## Implemented in source

- Deterministic published-package resolution in the hierarchy global → country → sector → product → tenant (tenant scope is available only to trusted server callers; public onboarding never supplies a tenant identity).
- Exact scope keys: global `default`; country ISO-3166 alpha-2; sector `<COUNTRY>:<sector>`; product `<COUNTRY>:<sector>:<product>`; tenant server-provided opaque scope key.
- Effective configuration provenance records the exact release IDs, scopes, versions and publication timestamps used.
- Deep object merge with arrays/scalars replaced by the more-specific published package.
- Non-overridable security invariants are enforced; a package attempting to weaken one fails closed with authority-unavailable.
- Universal onboarding classification now resolves the applicable package chain and returns provenance without granting identity, tenant, product, subscription, country or mission authorization.
- Public intake idempotency now returns 409 when an existing idempotency key is reused with a different payload; identical retries return the original saved intake.
- Added tests for layered resolution, provenance, fail-closed security invariants, input validation and routing classification.

## Important boundaries

This release does not create a full account, identity verification, payment, subscription, activation-code redemption, tenant provisioning, or operational authorization flow. It does not yet integrate effective package resolution into every protected mission mutation. It does not provide a Super Admin package editor/publisher. Country/sector/product packages beyond the global default must be created and published by a future governed administration workflow; absence of a package means inheritance, not certification or operational permission.

## Database

No new migration is introduced. The release uses the configuration release registry created by migration 0175. Existing databases must apply 0175 before deploying this release if they have not already done so. Do not rerun or rewrite applied migrations.

## Verification

Run on Node 24.22.1:

```sh
npm ci
npm run check:release
npm run check:health
npm run check:migrations
npm run check:schema
npm run check:release-engineering
npm run build
```

Then apply any outstanding migrations in staging, test the public onboarding endpoints, verify tenant isolation and authorization, and only then promote to production.
