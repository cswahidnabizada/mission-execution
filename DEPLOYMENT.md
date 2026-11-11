# ON Mission 16.105.0 — Deployment

## Requirements
- Node.js 24.22.1 (see `.node-version`)
- npm 10.x or 11.x
- Cloudflare account with the configured Worker, D1, KV, R2, AI and Vectorize bindings

## Canonical Cloudflare deployment path

The configured production release command is `npm run deploy:production`. The existing production Worker name remains `onmissionok-repo`; do not create a parallel Worker or bypass the repository release gates with a bare `wrangler deploy`. The command runs the build, release and health checks, migration checks, production certification, applies pending migrations and then deploys the Worker. The repository's GitHub-to-Cloudflare main-branch integration should remain the single production path; verify the selected repository, branch, project root and Cloudflare environment in the account before deployment.

Do not reset or recreate production D1. Confirm the live applied migration high-water mark before the migration step. Never commit provider credentials or `.dev.vars`; use Cloudflare secrets/bindings.

## Release checks

```bash
npm ci
npm run build
npm run check:release
npm run check:health
npm run check:migrations
npm run check:super-admin-build
npm run check:super-admin-decomposition
npm run check:release-engineering
npm run check:duplicate-files
node scripts/check-release-integrity.mjs
```

The command above is the canonical production deploy. Review its migration output and confirm the live migration ledger before allowing it to proceed. This source release adds no D1 migration; schema high-water remains 0166.

## Post-deploy acceptance
1. Sign in as a platform administrator and open Markets → Germany Logistics.
2. Open the Launch Workbench and confirm the certification projection renders, including next action, external dependencies, proof matrix and separate release gates.
3. Confirm the server-selected next task is the task opened by **GO TO NEXT REQUIRED TASK**.
4. Refresh and navigate stages; confirm the selected market/version/stage persists and no workbench runtime error occurs.
5. Confirm authority-unavailable and resource-conflict states remain blockers.
6. Confirm completing workbench tasks alone never reports market launch complete.
7. Verify publication, post-publication verification, activation and onboarding remain separate authorized operations.
8. Run a supervised Germany logistics mission with two test tenants, role separation, explicit human authorization, observable effects, independent verification and recovery evidence before any customer pilot.

## Deployment truth
A source check does not prove a successful Cloudflare build/deploy or live authenticated acceptance. This release does not create external provider credentials, approve legal terms, certify Germany-only data residency, verify backup restoration, or authorize physical execution. Do not activate public onboarding until the owning authorities have attached and verified the required evidence.
