# ON Mission 16.100.0 — Market Launch Workbench Runtime Repair

Cumulative baseline: 16.99.0  
Database migration: none  
Migration high-water mark: 0166

## Confirmed production-state defect

The supplied deployed application snapshot showed `WORKBENCH_UNAVAILABLE: state is not defined`. The failure was reproduced from source inspection: `bindWorkbenchActions` called `persistMarketContext(state, ...)` but did not receive `state` in its destructured options. Its caller also omitted the `state` argument. The workbench renderer therefore threw a `ReferenceError` while binding stage navigation after the workbench data was fetched.

## Implemented repair

- Added `state` to the `bindWorkbenchActions` options contract.
- Passed the current application state from `renderMarketFactory` into that binding function.
- Added a regression contract that checks both sides of the dependency contract and guards against reintroducing the missing lexical binding.
- Bumped runtime release/cache identity to 16.100.0.
- Preserved the six-area Super Admin navigation, single Market Operations entry, market context persistence, canonical resource and relationship authorities, dependency invalidation, and separate release transitions.
- No database migration or authority changes.

## Verification

The regression check verifies the exact failing function boundary and its call site. Existing 16.99.0 market-context/dependency checks and cumulative release/security/migration checks are retained. Passing source checks do not substitute for a live authenticated browser test.

## Deployment

Use Node 24.22.1 and npm 10.x/11.x. Run `npm ci`, `npm run build`, `npm run check:release`, `npm run check:health`, `npm run check:migrations`, `npm run check:super-admin-build`, `npm run check:super-admin-decomposition`, and `npx wrangler deploy`. No migration is required.

## Live acceptance

1. Open the existing Germany draft market.
2. Confirm the Launch Workbench loads its task list and certification summary.
3. Change stage and refresh; confirm the market, immutable version and stage are retained.
4. Use Previous/Next stage and Show All; confirm no `state is not defined` error.
5. Open a task Resolve workspace, close it, and confirm the task returns to its original stage.
6. Run a safe read-only refresh and verify dependency invalidation only marks dependent tasks stale.
7. Confirm unrelated completed tasks remain complete.
8. Confirm validate, authorize, publish, verify, activate and onboarding remain independent.

Do not publish or activate a market as part of this acceptance test.

## Preserved dependency and authority guarantees

Search misses are explicitly labeled as scoped search results, not proof of global absence. Resource candidates are inspected through their canonical owner before linking. Canonical relationship preview, commit and read-back remain required. A market package version remains immutable; changes create a new version. Dependency invalidation is exact-version scoped, preserves unrelated completed tasks and retains stale evidence history. An unavailable authority remains a blocker, never an empty or healthy result.

The Market Factory remains the authority for market packages and versions; the Resource Relationship Engine remains the authority for relationships; canonical customer, identity, mission, provider and product services remain their own authorities. Publication, verification, activation and public onboarding remain separate transitions.

This source release does not certify the live application or replace authenticated browser verification. It does not certify external legal approval, provider authorization, actual data residency or physical mission evidence. A passing source check is not a production pilot certification.

This release does not publish, verify, activate or open public onboarding. Publication, verification, activation and onboarding require their own separately authorized operations and evidence.

## Preserved platform-wide engineering context

This release is cumulative and preserves the existing Global Compliance Context, Private ForYou experience, Consent & Privacy controls and Data Subject Rights workflows. The canonical schema source remains `database/schema.current.sql`; schema generation, deterministic build, migration contract and schema validation remain governed by their existing scripts. the canonical domain ownership model, canonical capability boundaries, the Capability Registry and canonical vocabulary remain authoritative. Logistics remains the initial market. The historical term Cargo is retained only as a compatibility reference; the current domain vocabulary uses Object.
