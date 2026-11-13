# ON Mission 16.116.0 — One Governed Platform, Multiple Market Experiences

Cumulative source candidate. This release extends the existing ON Mission multi-tenant mission-execution platform with a unified capability governance workspace, shared synthetic Simulation Lab scenarios, Digital Daftar business journal, installable Daftar PWA and data portability, controlled Afghanistan pilot controls, and a governed public market-data API.

**The product remains one system:** shared identity, tenants, canonical mission lifecycle, security, audit, data governance, resources and authorization. Country/sector packages configure distinct user experiences; they do not create parallel authorities.

## Current release state

- Version: `16.114.0`
- Status: hardening candidate; not deployed by this build task.
- Node.js production requirement: `24.22.1` (`.node-version`).
- Database migrations: 173 ordered migrations; new high-water mark `0173`.
- See `RELEASE.md`, `RELEASE-REPORT.txt` and `DEPLOYMENT-16.113.md` for implementation boundaries, verification and rollout steps.

## Main new workspaces and user features

- **Super Admin → Capabilities & Data:** capability lifecycle, market bindings, Daftar profile governance, Afghanistan pilot reviews/allowlist, public data publications and quality history.
- **Super Admin → Simulation Lab:** Germany Logistics regression and Afghanistan Digital Daftar synthetic scenarios; saved model runs can be linked as non-certifying capability evidence.
- **Digital Daftar:** balanced operational business journal, reconciliation, 30-day summaries, offline queue recovery, CSV/JSON exports, print-to-PDF and encrypted ZIP backup.
- **Public Data:** versioned, read-only public aggregate API for published market indicators and approved FX reference data.

## Build and release checks

```bash
npm ci
npm run build
npm run check:migrations
npm run check:release
npm run check:health
npm run check:production-certification
```

Use Node 24.22.1. `npm run deploy:production` is the existing deployment path; review the migration plan and backup first. Do not use a bare Worker deployment as a substitute for applying the ordered D1 migrations.

## Important safety boundaries

- Afghanistan is not activated by this release. Use the existing Market Factory and explicit pilot review/allowlist gates.
- Market telemetry is opt-in and pseudonymous, not anonymous. Public data only returns qualified aggregate results.
- Merchant-reported payments are not provider verification.
- Simulation Lab's new scenarios are deterministic synthetic models; no production code or real-world commands are executed.
- Restore currently validates backups without importing or overwriting live data.
- Dari/Pashto translation is beta. The business book is not statutory accounting/tax certification.

## Release history

Earlier cumulative release history is preserved in the project docs and test suite. This release's implementation is documented in `RELEASE.md`.
