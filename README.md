# ON Mission 16.87.0 — Germany Logistics Market Platform

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
