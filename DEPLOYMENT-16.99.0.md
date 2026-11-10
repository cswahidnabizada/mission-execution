# ON Mission 16.99.0 deployment

Cumulative source baseline: 16.98.0 (deployed Cloudflare Worker version `ad30c586-1417-47af-b16c-9b2bb9aa55bc`).

## Build environment

- Node.js: `24.22.1` (required by `.node-version` / `.nvmrc`)
- npm: `10.9.2` (or another supported npm 10/11)

## Cloudflare build/deploy command

Configure the Cloudflare Worker build command to run the gates before deployment:

```bash
npm ci
npm run build
npm run check:release
npm run check:health
npm run check:migrations
npm run check:super-admin-build
npm run check:super-admin-decomposition
npm run check:release-engineering
npx wrangler deploy
```

No D1 migration is introduced by 16.99.0; migration high-water remains `0166`.

## Post-deploy acceptance

1. Sign in as Super Admin and confirm six primary areas and exactly one MARKETS → Market Operations entry.
2. Open a market, select a version and stage, navigate to another workspace, return, and refresh. Confirm market/version/stage context restores.
3. In a mutable draft, pin an eligible canonical resource. Confirm package and relationship read-back, then confirm the dependency invalidation response lists affected task keys and leaves unrelated completed tasks intact.
4. Attempt invalidation against a published/verified/live version and confirm it is rejected with `MARKET_DEPENDENCY_VERSION_IMMUTABLE`.
5. Confirm publication, verification, activation and onboarding remain separate actions.
6. Inspect browser console and network requests. Do not use production activation or public onboarding as a test action.

The source tests do not replace authenticated live-worker/browser acceptance. Germany Logistics pilot approval remains evidence-gated.
