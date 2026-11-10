# Deploy ON Mission 16.100.0

Required build runtime: Node 24.22.1; npm 10.9.2 or compatible npm 10/11.

```bash
node --version
npm --version
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

No database migration is required. Migration high-water remains 0166.

After deployment, sign in as Super Admin and open MARKETS → Market Operations → Germany draft market. Confirm the launch workbench loads its task register and certification. Change stage, refresh, use Previous/Next and Show All, and open/close a task Resolve workspace. Confirm the `state is not defined` error is gone and the selected market/version/stage persist.

Do not publish, verify, activate or open onboarding as part of this acceptance test. Record the deployed Worker version ID and browser console/network results. Source checks are not a substitute for authenticated live acceptance.
