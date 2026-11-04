# ON Mission 16.96.0 — Canonical Market Resource Selection, Linking & Read-Back

## Scope
This cumulative release extends the 16.95.0 intelligent market configuration workflow with an explicit, auditable relationship between a canonical Market Factory package and selected canonical reusable resources.

## Implemented
- `market_package` is now an inspectable endpoint in the canonical resource relationship authority. Its identity and country scope are resolved from `platform_market_packages`.
- The Market Launch Studio reads back active canonical relationships for the selected market.
- Pinning a canonical resource now previews and commits a `depends_on` relationship from the market package to the selected resource through the existing resource relationship authority.
- Relationship commits require step-up authorization, validate endpoint identity and market/tenant scope, apply cycle protection, and produce critical audit evidence.
- The resource binding is then saved as a new immutable market package version through the existing Market Factory import authority.
- The UI reads back both the new package version and the canonical relationship and reports success only when both are present.
- If package-version creation fails after relationship creation, the UI attempts a compensating relationship removal. Failed compensation is surfaced as an administrator recovery issue.
- Existing market package binding validation continues to re-resolve the canonical resource and detect stale status/version snapshots.
- Existing canonical resource ownership remains unchanged; the market package is a composition and dependency endpoint, not a second resource registry.

Search misses are explicitly labeled as scoped search results; they are not treated as proof that a canonical resource does not exist.\n\n## Safety and authority boundaries
- No canonical resource is created or modified by relationship linking.
- Relationship linking creates only a graph edge between existing canonical identities.
- Resource configuration remains with the owning resource authority.
- Market package edits remain immutable version imports.
- Step-up authorization is required for relationship mutation and package import.
- Publication, verification, activation and onboarding remain separate governed operations.
- No migration is introduced; migration high-water remains 0166.

## Verification
Source-level release tests cover the route contract, market-package endpoint resolution, scope enforcement, audit-backed relationship commit, read-back, compensation path and immutable package import. Cumulative release, health, migration and Super Admin checks must be run in the deployment environment. Authenticated live end-to-end behavior still requires post-deployment verification.

## Deployment
Use Node 24.22.1 and npm 10.x:
`npm ci`
`npm run build`
`npm run check:release`
`npm run check:health`
`npm run check:migrations`
`npm run check:super-admin-build`
`npx wrangler deploy`

No database migration is required for 16.96.0.


Historical cumulative baseline: 16.95.0 — Intelligent market dependency resolution.

16.96.0 — Intelligent market dependency resolution is retained as the cumulative dependency-resolution foundation.

This source release does not certify live production behavior, legal approval, provider credentials, data residency, customer onboarding or real mission outcomes; those require independent evidence and production verification.

Real customer pilots and physical mission evidence are not supplied by simulation or this source package.

Resource linking does not publish, verify, activate or open public onboarding for a market.
