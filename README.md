# ON Mission 16.107.0 — Country-aware Mission Execution Platform

Cumulative release candidate based on the deployed 16.80.0 Germany Logistics / Super Admin baseline. This release consolidates owner lifecycle completion, durable mutation idempotency and reconciliation, 26-family resource certification contracts, Asset 360/dependency governance, a staged Germany Logistics Market Package, versioned onboarding legal acknowledgements, and adversarial production-certification gates.

The bundled Germany Logistics package is available at `config/markets/germany-logistics-market.json` and can be staged directly from **Super Admin → Market Factory → Stage Germany Logistics**. Staging is draft-only. It does not create duplicate canonical resources, publish a market, activate public onboarding, prove Germany data residency, or approve legal text.

**Release status: cumulative source candidate.** Deploying the Worker is not equivalent to legal approval, a LIVE Market Release, verified regional placement, tenant-isolation proof, or a real customer pilot. See `RELEASE.md`, `RELEASE-REPORT.txt`, and `docs/markets/GERMANY-LOGISTICS-OPERATIONS.md` for exact boundaries and operator steps.

## Build and checks

- Node.js: 24.22.1 (`.node-version`)
- `npm ci`
- `npm run build`
- `npm run check:release`
- `npm run check:health`
- `npm run check:migrations`
- `npm run check:production-certification`
- `npm run deploy:production`

The production deploy script runs build, release and certification gates, applies ordered D1 migrations from `database/migrations` (configured as the D1 `migrations_dir`), then deploys the Worker. If deploying with a bare `npx wrangler deploy`, run `npm run migrate:production` first: Worker deployment does not apply D1 migrations. Review migration output and production backups before deployment.

## Country-aware homepage and market experience (16.107.0)

The public homepage now explains mission execution, data infrastructure, country markets, platform capabilities and public aggregate data. Germany Logistics displays its current Market Factory and onboarding state. Afghanistan displays the provisioned Digital Daftar features and the canonical market-activation gate. Public data is served only from fresh cohort-protected aggregates; private ledgers are never exposed. See `docs/16.107-public-homepage-and-market-experience.md` and `DEPLOYMENT-16.107.md`.

## Embedded Digital Daftar (16.106.0)

ON Mission now includes an Afghanistan-first, country/sector-governed Give & Get ledger, offline sync, opt-in pseudonymous market telemetry and batch Product Passport foundation. It reuses the existing Worker, D1, KV, R2, tenant identity, country/sector profile, audit and privacy authorities. See:

- `docs/DAFTAR-ARCHITECTURE.md`
- `docs/DAFTAR-INTEGRATION-CONTRACT.md`
- `config/daftar/sector-template.schema.json`
- `config/daftar/sector-templates.v1.json`
