# ON Mission 16.99.0 — Unified Super Admin & Market Operations

## ON Mission 16.98.0 — Unified Super Admin & Market Operations

Cumulative baseline: 16.98.0  
Database migration: none  
Migration high-water mark: 0166

## Product decision

Reduce the Super Admin Control Plane to six human-facing areas:

1. COMMAND — platform situation, exceptions, approvals and next actions.
2. MARKETS — one Market Operations workspace for every market lifecycle activity.
3. PLATFORM — reusable platform resources and shared product experience.
4. CUSTOMERS & ACCESS — organizations, people, permissions, subscriptions, billing and missions.
5. AI & INTEGRATIONS — agents, providers, connections and infrastructure.
6. SECURITY & RECOVERY — privacy, residency, policy, audit, continuity and recovery.

The Market Operations workspace is the only primary navigation entry for market-specific work. Configuration, resource reuse and linking, dependency assessment, evidence, certification, immutable release history, publication, activation, customer onboarding, operational health and market recovery remain coordinated from the selected market.

## Implemented

- Replaced the eight-area COMMAND / RESOURCES / BUILD / RELEASE / LAUNCH / OPERATE / GOVERN / RECOVER navigation with six consolidated areas.
- Made MARKETS a single-entry area. All market-related legacy workspace routes resolve to Market Operations.
- Moved generic resource management to PLATFORM; market resource search, relationship creation, read-back and dependency assessment stay inside the selected market.
- Consolidated customer and access work into CUSTOMERS & ACCESS.
- Consolidated AI, provider and infrastructure work into AI & INTEGRATIONS.
- Consolidated privacy, policy, residency, security, audit, backup and recovery into SECURITY & RECOVERY.
- Removed the duplicate Market Launch Studio sidebar shortcut.
- Removed the duplicate workspace-directory and product-release navigation cards from Control Center.
- Removed market-launch objective creation from the platform objective composer; market launch objectives now start in Market Operations.
- Kept platform objectives and platform health in Control Center.
- Preserved old market-related workspace bookmarks by routing them into Market Operations.
- Added a read-only market-scoped operational health endpoint and panel for database reachability, product health, customer organizations, active users, missions and provider policy/contract posture.
- Each metric is read from its canonical source and independently reports UNAVAILABLE on read failure. Platform-wide totals are not substituted for market-scoped counts.
- Provider policy and contract status is explicitly not represented as a live connectivity probe.
- No database migration; high-water mark remains 0166.

## Authority and safety boundaries

- Search misses are explicitly labeled as scoped search results, not proof of global absence.
- Navigation consolidation does not merge or replace canonical domain authorities.
- The Market Factory remains authoritative for market packages and immutable versions.
- Resource Relationship Engine remains authoritative for canonical market-resource relationships.
- Product health, organizations, identities, missions and provider governance retain their owning services/tables.
- Operational health is read-only.
- Publication, verification, activation, onboarding and destructive market lifecycle actions remain separately authorized. This release does not publish, verify, activate or open public onboarding.
- Unknown or unavailable source data is not converted into a healthy or zero state.
- No real legal approval, residency, provider connectivity or physical mission outcome is inferred from configuration.
- This source release does not certify the live application or replace authenticated browser verification. It does not certify external legal approval, provider authorization, actual data residency or physical mission evidence.

## Verification

The 16.99.0 source acceptance contract checks the six-area navigation, single market entry, legacy-route convergence, removal of duplicate Control Center navigation, market-scoped operational data sources and read-only health endpoint.

The cumulative release, health, migration and Super Admin build checks must pass in the Node 24.22.1 build environment. Authenticated browser acceptance against the deployed Worker is still required before production certification.

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

No migration is required for 16.99.0.

## Live acceptance

1. Confirm the Super Admin primary navigation exposes exactly six areas.
2. Open MARKETS and confirm there is only one Market Operations entry.
3. Open an existing draft market and complete a stage selection; verify the selected market and stage survive refresh.
4. Confirm market resources, relationships, certification and release history are available inside that selected market.
5. Open a live market and inspect the market-scoped operational health panel.
6. Confirm customer/user counts are scoped by market country and sector; mission counts use the same market scope.
7. Confirm unavailable sources display UNAVAILABLE and do not display fabricated zero values.
8. Confirm legacy release, launch, product-health and certification links route into Market Operations.
9. Confirm publication, activation and public onboarding remain separate authorization-gated operations.

Use a draft market for configuration tests. Do not use a live market for destructive or exploratory acceptance.


## Preserved platform-wide engineering context

This release is cumulative and preserves the existing Global Compliance Context, Private ForYou experience, Consent & Privacy controls and Data Subject Rights workflows. The canonical schema source remains `database/schema.current.sql`; schema generation, deterministic build, migration contract and schema validation remain governed by their existing scripts. Canonical domain ownership, canonical capability boundaries, the Capability Registry and canonical vocabulary remain authoritative. Logistics remains the initial market. The historical term Cargo is retained only as a compatibility reference; the current domain vocabulary uses Object.


## 16.99.0 — Persistent Market Operations & Dependency-Aware Readiness

- Persist and restore market, version and stage context across refresh and workspace navigation.
- Keep a single Market Operations command center and preserve PLATFORM as the owner of shared reusable resources.
- Add exact-version, step-up-protected dependency invalidation for pinned canonical resources.
- Preserve previous evidence as stale history, reset affected completed task contracts, and retain unrelated completed tasks.
- Reject invalidation against immutable release versions.
- Keep publication, verification, activation and onboarding as independent governed transitions.
- No database migration; migration high-water remains 0166.
