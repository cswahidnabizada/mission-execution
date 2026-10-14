# Mission Execution — Single Main-to-Cloudflare Deployment

Release: 16.10.10

## Authority

`GitHub main → Cloudflare Git integration → Worker onmissionok-repo` is the single production deployment path. Do not run a parallel GitHub Actions production deployment.

## Cloudflare Worker build settings

- Repository: `cswahidnabizada/ONmissionOK-repo`
- Branch: `main`
- Project root: `/`
- Runtime: Node.js 24
- Build command: leave empty (the canonical deploy command runs the build)
- Deploy command: `npm run deploy:production`

Do not use bare `npx wrangler deploy`: it bypasses the repository's required production certification and migration sequence. The canonical command runs build and release gates, required runtime/recovery certification, applies pending migrations to the configured production D1, then deploys the Worker. A missing certification prerequisite must stop deployment.

## Before connecting or deploying

1. Confirm `wrangler.jsonc` names the intended production Worker and correct production D1/KV/R2/Vectorize resources.
2. Confirm the required production certification environment values are available to the Cloudflare build command without committing credentials.
3. Confirm the currently applied migration high-water mark. This release carries migration 0155 and adds no migration beyond the 16.10.0 baseline. Do not reset or recreate production D1.
4. Confirm the configured Worker custom domain and `APP_URL` match production.

## Release truth

A successful source-level release gate is not a deployed-runtime certification. Record the Cloudflare deployment result and run the authenticated end-to-end mission/recovery certification after deployment. Preserve the canonical journey:

`OBSERVE → UNDERSTAND → PLAN → EVALUATE → ACCEPT → AUTHORIZE → PREPARE → ASSIGN → EXECUTE → EFFECT → VERIFY → RECOVER → OUTCOME → LEARN → NEXT SITUATION → OBSERVE`


## Repository identity

Canonical Git repository: https://github.com/cswahidnabizada/mission-execution
Canonical product name: Mission Execution
Canonical release-version source: `VERSION`.

The existing production Cloudflare Worker name is intentionally unchanged in this release to avoid accidentally provisioning a second production endpoint.
