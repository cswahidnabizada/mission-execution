# ON Mission 16.97.0 — Unified Market Operations & Certification

Cumulative baseline: 16.96.0  
Database migration: none  
Migration high-water mark: 0166

## Objective

Consolidate market configuration, canonical resource relationships, evidence, certification and release history into one market workspace with one primary nine-stage navigator.

## Implemented

- Replaced the duplicated guided-launch and configuration stage navigation with one nine-stage navigator.
- The same stage selection now controls both the staged package form and the canonical task group.
- Added stage-level task counts, evidence progress and blocker indicators to the primary navigator.
- Preserved selected market and stage in URL query parameters (`marketId`, `marketStage`) for deep linking and refresh continuity.
- Collapsed legacy structured and raw JSON editors into explicitly advanced compatibility drawers.
- Collapsed immutable release history into the same market workspace.
- Search misses are explicitly labeled as scoped search results, not proof of global absence.
- Added canonical relationship impact read-back to dependency preflight. Existing candidates show the count of linked market dependencies where the relationship authority can be read; unavailable impact state is shown as unavailable, never as zero.
- Preserved canonical resource search, relationship preview/commit, step-up authorization, immutable market package versions, audit and relationship read-back.
- Preserved separate publication, activation and public onboarding gates.
- Added a cumulative 16.97.0 market operations/certification contract test.

## Architecture and safety

- No new resource registry or competing market authority.
- No database migration.
- No change to canonical relationship ownership.
- No weakening of step-up authorization.
- No direct publish, activate or onboarding bypass. This release does not publish, verify, activate or open public onboarding.
- Unknown relationship impact remains unknown and is not treated as safe.
- This release does not certify external legal approval, provider authorization, actual data residency or physical mission evidence.
- Market package configuration remains separate from canonical resource mutation.
- The selected market remains the scope for all stage work.

## Verification

Source-level release checks validate the unified stage navigator, deep-link continuity, canonical relationship impact read-back, advanced-only legacy editors, release history consolidation and independent release gates.

A passing source contract does not certify the live application or replace authenticated browser verification against the deployed Cloudflare Worker. Production flow certification still requires the Node 24.22.1 build and live acceptance tests using an authorized Super Admin account and a draft market.

## Deployment

Use Node 24.22.1 and npm 10.x or 11.x:

```bash
npm ci
npm run build
npm run check:release
npm run check:health
npm run check:migrations
npm run check:super-admin-build
npx wrangler deploy
```

No migration is required for 16.97.0.

## Live acceptance

Use a draft market:

1. Open the market using `Markets`.
2. Open one of the nine stages.
3. Confirm the selected stage controls both its configuration panel and task list.
4. Refresh the page and confirm the same market and stage are restored.
5. Search for a canonical resource and inspect its dependency impact read-back.
6. Save a staged change as a new immutable version.
7. Confirm canonical read-back and stage reassessment.
8. Confirm publication, activation and onboarding remain independently gated.

Do not use a live market for destructive or exploratory acceptance tests.
