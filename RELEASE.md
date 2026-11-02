# ON Mission 16.91.0 — Germany Pilot Simulation Completion

Base: ON Mission 16.80.0
Status: cumulative source candidate; production deployment, legal approval, regional placement evidence and real-world pilot certification remain external gates.

## Release objective

Deliver one connected operating platform for the Germany Logistics market through three layers:

1. **Platform Factory / Super Admin** — canonical data, policies, translations, legal content, product definitions, market packages, configuration, integrations, infrastructure, releases and governance.
2. **Customer Operating Platform** — organization onboarding, people, executors, objects, missions, assignments, permissions, evidence and operational workflows.
3. **Mission Execution Intelligence** — situation understanding, planning, evaluation, acceptance, authorization, preparation, assignment, execution, effects, verification, recovery, outcomes, learning and next situation.

The canonical journey remains OBSERVE → UNDERSTAND → PLAN → EVALUATE → ACCEPT → AUTHORIZE → PREPARE → ASSIGN → EXECUTE → EFFECT → VERIFY → RECOVER → OUTCOME → LEARN → NEXT SITUATION → OBSERVE.

Permanent priority: Security → Truth → Liveness → Stability → Experience → Scale.

## Cumulative changes

### 16.81.0 — Owner Lifecycle Completion

- Expanded the owner lifecycle registry for Sector, Product Country, Country Blueprint, Product Definition, Policy and Configuration.
- Sector activation/deactivation is delegated to the reusable Sector Catalog, revision fenced, and deactivation is blocked when compiled/published/active Product Definitions depend on the sector.
- Product Country activation/deactivation remains owned by Product Country Catalog with live-launch dependency checks.
- Country Blueprint `prepare_for_launch` delegates to the canonical blueprint readiness evaluator and reads back the resulting state.
- Product Definition `compile` delegates to Product Factory, is draft-only and verifies the compiled manifest hash and owner read-back.
- Policy activation/deactivation is delegated to the reusable Policy Catalog; deactivation is blocked while published/verified/live Market Package versions reference the policy.
- Configuration transitions remain delegated to Platform Configuration Authority.
- Every adapter exposes only commands that have an implementation. Unsupported suspend/resume/retire operations remain fail-closed.

### 16.82.0 — Durable Mutation & Recovery

- Added D1 migration 0165 with `platform_owner_lifecycle_operations` as a durable idempotency/reconciliation ledger.
- Owner mutations require a stable idempotency key (request ID is a compatibility fallback); same-key/same-command completed calls return the stored result; key reuse with a different fingerprint is rejected.
- Interrupted or uncertain commands remain `IN_PROGRESS` or `RECOVERY_REQUIRED`; the service refuses blind replay and exposes a read-only operation lookup endpoint.
- Expected revision timestamps fence supported owner writes; stale writes return conflict rather than overriding newer truth.
- Read-back failures are retained as recovery-required outcomes. Audit failure is not silently converted to success.
- This ledger is an operation journal, not a distributed transaction across independent owner services. Recovery still requires inspecting canonical owner state and reconciling the operation record.

### 16.83.0 — Universal Resource Certification

- Retains the 26-family canonical resource capability registry and its fail-closed lifecycle reporting.
- The cumulative contract test covers the resource capability baseline and explicit owner support boundaries.
- Resource creation/editing, relationships and deletion continue through their owning canonical services; `depends_on` remains the only generally supported semantic relationship unless an owner registers another contract.
- This release does not claim that all 26 families have completed authenticated browser, production D1 mutation, lifecycle and recovery certification. Those are distinct evidence gates.

### 16.84.0 — Asset 360 & Dependency Intelligence

- Preserves canonical Asset 360, resource explorer, lifecycle ledger, relationship guard, revision-pinned bindings and dependency-aware deletion.
- Owner-specific lifecycle actions are exposed from the adapter registry in Asset 360; UI capability must be derived from server support, not inferred from resource type. Failed/uncertain commands expose a durable operation key and read-only operation inspection; never blindly retry an uncertain mutation.
- Dependency checks are implemented for Sector deactivation and Policy deactivation against compiled/active product definitions and published market packages respectively.
- Full graph-wide impact simulation across every resource family remains a certification target, not a universal guarantee.

### 16.85.0 — Germany Market Completion Foundation

- Added the complete, versioned Germany Logistics Market Package source at `config/markets/germany-logistics-market.json`.
- Added a bundled Super Admin Market Factory action to stage that package as a draft using the existing governed intake/import authority.
- The package includes Germany (`DE`), logistics sector, German and English language bundles, onboarding and support content, privacy notices, terms, imprint, consent text, canonical role mapping, policy set, residency requirements, retention purposes, billing configuration, notification policy, mission capabilities, canonical action codes, mission journey and optional/required integration requirements. The required email provider remains unconfigured until a real provider is selected in Connections.
- Content is editable by creating a new immutable Market Package version through Market Factory. Existing shared canonical resources are reconciled through their owning authorities; the package is not a second source of live truth.
- All legal documents are marked `researching` and content remains `draft`. The package is intentionally not publishable until the real controller identity, providers/subprocessors, data flows, legal bases, retention schedule, terms, imprint and legal approvals are completed.
- Germany regional placement remains evidence-gated. The Worker deployment environment variables do not by themselves prove that D1, KV, R2, Vectorize, logs, backups, support tooling and subprocessors are physically located in Germany or the EU.

### 16.86.0 — Tenant Provisioning & Pilot Operations

- The homepage selects the Germany Logistics onboarding route only when an active Germany Product Launch and a LIVE Market Package with `OPEN` onboarding are both visible to the public availability authority.
- Registration preselects Germany and Logistics from the market URL and requests the canonical country/sector onboarding requirements.
- For a LIVE Germany Logistics release, organization onboarding requires explicit acceptance of the exact active Terms version and acknowledgement of the exact active Privacy Notice version.
- Added migration 0166 to persist the accepted Terms version, acknowledged Privacy Notice version and acknowledgement timestamp on the canonical organization onboarding record.
- Optional analytics/product communications are not preselected and are not bundled into acceptance of the core service terms.
- Existing canonical organization provisioning, verification, trust, capabilities, subscription and tenant lifecycle remain the owner of onboarding truth.
- Product Factory composition creates a typed Product Definition component set (identity, vocabulary, legal/localized content, capabilities, workflow, roles, experience, policies, integrations and dependencies) with stable package-version idempotency keys. Country Product Launch validation compiles the definitions through the canonical compiler. The Product Preparation Workspace still requires real source-backed legal, commercial, security, operations and research decisions; if publication pauses at `VALIDATING_LAUNCH`, complete that canonical workspace and use the explicit publication recovery action rather than re-importing.
- This does not create a customer or claim a Germany pilot is provisioned. Real tenant onboarding is only available after a market is deliberately opened and the underlying canonical launch is active.

### 16.87.0 — Adversarial Production Certification

- Added cumulative regression coverage for the Germany market package, legal/localization content, provider integration gates, canonical Product Definition composition, owner lifecycle commands, durable operation ledger, stage-contract human-attestation versus canonical-verification semantics, public market content, and live onboarding gates.
- Preserves security, data integrity, architecture, production readiness and production hardening checks.
- Production certification still requires Node 24.22.1 build, migration application, authenticated browser tests, live D1 read/write/read-back, cross-tenant isolation, authorization/step-up checks, concurrency and stale revision tests, interruption/recovery tests, backup/restore evidence, regional placement/subprocessor verification and a controlled Germany Logistics customer pilot.

## Germany Logistics package contents

The package ships the following editable market content in German and English:

- Welcome and organization onboarding guidance.
- Privacy Notice (Datenschutzhinweise).
- Terms of Service (Nutzungsbedingungen).
- Imprint / provider information (Impressum).
- Consent and optional preference explanations.
- Support and contact guidance.

The market policy set includes GDPR/BDSG review requirements, residency, operational safety, consent governance and retention governance. The package includes purpose-specific retention proposals and EUR billing configuration. Retention periods, tax configuration, provider inventory and legal terms are draft proposals and must be validated against the actual business, legal entity, service providers and statutory duties. They are not legal advice or a compliance certification.

## New API surfaces

- `POST /api/platform/admin/market-factory/germany-logistics/seed` — Super Admin step-up protected; stages a new Germany Logistics package version. It never activates the market.
- `GET /api/platform/admin/resource-management/owner-lifecycle-adapters/operations/:operationKey` — authenticated read-only lookup for a durable owner operation.
- `GET /api/product/market-content?countryCode=DE&languageCode=de&code=de-privacy` — returns only content from the active LIVE Germany market release.
- `GET /api/product/availability` — exposes a Germany onboarding target only when the country launch is active, Market Package is LIVE and onboarding mode is OPEN.

## Database migrations

- 0165 — owner lifecycle idempotency and reconciliation ledger.
- 0166 — versioned Germany market Terms acceptance and Privacy Notice acknowledgement on organization onboarding records.

The migration chain is expected to contain 166 ordered migrations, high-water mark 0166. The canonical `database/schema.current.sql` snapshot is regenerated from the complete migration chain.

## Deployment and operational steps

1. Build with Node.js 24.22.1 and install the locked dependencies with `npm ci`.
2. Run `npm run build`, `npm run check:release`, `npm run check:health`, `npm run check:migrations` and `npm run check:production-certification`.
3. Confirm a production D1 backup. The D1 binding now declares `migrations_dir: database/migrations`; run `npm run migrate:production` and verify migration high-water mark 0166. A bare `npx wrangler deploy` does not apply D1 migrations.
4. Deploy the Worker (`npx wrangler deploy` after the migration step, or the full `npm run deploy:production` pipeline when runtime-certification credentials are configured) and verify its release identity and API health.
5. Sign in to Super Admin → Market Factory → **Stage Germany Logistics**. Inspect the draft and complete canonical resource reconciliation.
6. Review German and English content. Replace provider, controller, contact, support, tax and legal placeholders. Have German legal/privacy counsel review the actual service and documents.
7. Verify actual data locations and every subprocessors' transfer/residency behavior, including backups, logs, observability, AI, email, support and external integrations.
8. Complete Test Lab, signed release, verification, regional placement, backup/restore, security and tenant-isolation evidence.
9. Only after independent approval should Super Admin publish, verify, activate the market and deliberately change onboarding mode to OPEN.
10. Create the first controlled Germany Logistics tenant and run the real-world mission journey with a human executor, independent verification and recovery evidence.

## Verification status vocabulary

- **Implemented in source** — code/configuration exists and source checks can verify its contract.
- **Source-tested** — named automated checks passed in this build environment.
- **Deployed** — Cloudflare reports successful Worker deployment.
- **Production-verified** — authenticated tests against the deployed Worker and production D1 prove behavior.
- **Approved** — authorized human/legal/operational decision exists with durable evidence.
- **Pilot-certified** — real customer mission execution and recovery evidence satisfy the Germany pilot contract.

Never promote one status to another by inference. A successful deployment is not a LIVE market or a pilot certificate.

## Protected architecture and historical capabilities

The cumulative release preserves the canonical domain model, canonical capability registry, Global Compliance Context, Private ForYou, Consent & Privacy, Data Subject Rights, tenant isolation, canonical mission lifecycle authority, one source of truth, and the governed Logistics vocabulary. Historical Cargo terminology is retained only where compatibility documentation requires it; current product vocabulary uses Object and Executor.

## Deterministic release engineering and migration contract

The deterministic release pipeline derives the runtime identity from `VERSION`, regenerates version-pinned assets, builds `RELEASE-MANIFEST.json` and hashes the canonical schema snapshot. The migration contract requires a gap-free ordered SQL migration chain and a regenerated `database/schema.current.sql` snapshot. The canonical domain and canonical vocabulary remain stable across releases. The canonical Capability registry is the authority for supported resource and mission capabilities; the UI must not infer capabilities that the server does not expose.

## ON Mission 16.89.0 — Germany Market Autonomous Preparation

Base: ON Mission 16.88.0

This cumulative release adds a single **PREPARE GERMANY** action to the selected Germany Logistics draft in Market Launch Studio. The action is step-up protected and server-executed. It reads the selected immutable package's persisted stage contracts and runs only an explicit allowlist of registered canonical preparation commands: canonical reads and validation, Logistics resource search/selection/configuration, market-sector relationship creation, integration inspection/verification, and canonical Product Test Lab execution. Each command uses the existing owning-authority adapter, persisted stage contract, read-after-write verification, and audit trail.

The runner is bounded to 40 commands per invocation, scoped to country DE and Logistics, and restricted to DRAFT/VALIDATED package versions. It reports exact per-step outcomes and blockers. It never fabricates evidence, marks human attestations complete, supplies provider credentials, approves legal/commercial/residency decisions, authorizes/publishes/verifies/activates a release, provisions a tenant, or opens public onboarding. Existing package and global Logistics identities are reused; no new Germany package or Logistics sector is created by the runner.

No database migration is added. Migration high-water remains 0166. The existing canonical release lifecycle and public onboarding gates are unchanged.

### Verification and deployment

Use Node 24.22.1 and npm 10.9.2. Run `npm ci`, `npm run build`, `npm run check:release`, `npm run check:health`, `npm run check:migrations`, and `npm run check:production-certification`. Production runtime certification still requires configured credentials and live environment evidence. Back up production D1 before any required migration; this release adds none. Deploy the Worker through the approved Cloudflare pipeline, then hard-refresh and verify `market-factory.js?v=16.89.0` loads. Open Super Admin → Market Launch Studio → Germany Logistics → selected draft and click **PREPARE GERMANY** once. Review the returned operation summary and only act on the remaining genuine human/external gates.

## ON Mission 16.90.0 — Germany Operational Readiness & Unified Public Experience

Base: 16.89.0 (cumulative; no prior market or mission authority replaced).

### Release objective

Move the Germany Logistics market from package preparation toward operational proof while simplifying the public product experience. Preserve the canonical mission lifecycle and global Logistics sector. Keep every market transition evidence-gated.

### Implemented in this source candidate

- Rebuilt the public landing experience around a clear mission-execution value proposition, organization/executor/participant audiences, mission intelligence, execution control and verifiable outcomes.
- Added a Germany Logistics market-preview experience with clear market state, an explanation of the governed mission journey, and an explicit public-onboarding-closed message when the canonical availability authority returns a market preview rather than an open market.
- Kept the homepage dependent on `/api/product/availability`; it does not infer market launch from configuration files, environment variables or a local flag. Sign-in and workspace actions preserve session-aware routing.
- Added responsive visual treatment for the public experience, including mobile layouts, typography, navigation, feature cards and market status presentation.
- Preserved the Market Launch Studio's single `PREPARE GERMANY` action, canonical workbench, controlled launch supervisor, collapsed detailed task view and step-up protected operations from 16.89.0.
- Added a cumulative public-experience and market-readiness regression contract.
- Updated release identity and browser asset cache-busting to 16.90.0.
- No new D1 migration. Migration high-water remains 0166.

### Architecture and safety boundaries

- No public onboarding is opened by this release. The canonical availability authority continues to decide whether registration is available.
- No legal, tax, commercial, provider, residency, subprocessor, backup/restore or physical-pilot evidence is fabricated.
- No physical action is autonomously actuated. Human authorization remains required.
- The Germany preview is not a live-service claim. It displays the market/release state returned by the server.
- Existing global Logistics identity, immutable Market Package versions, tenant isolation and mission truth authorities remain canonical.

### Not claimed complete by this source release

A full end-to-end production certification, real provider authorization, German legal approval, infrastructure residency proof, backup/restore proof, authenticated cross-tenant adversarial browser testing, live customer onboarding and a physical Germany Logistics pilot still require live environment evidence and authorized human decisions. The Test Lab and simulator remain bounded by the capabilities actually registered in their canonical authorities; this release does not claim all mission scenarios are production-certified.

### Verification and deployment

Use Node 24.22.1 and npm 10.9.2. Run `npm ci`, `npm run build`, `npm run check:release`, `npm run check:health`, `npm run check:migrations` and the required runtime/recovery certification in a configured live certification environment. No migration is introduced by 16.90.0. Deploy through the approved Cloudflare pipeline and verify the homepage, sign-in routing, market preview and Super Admin Market Launch Studio after deployment.


## 16.91.0 — Germany Pilot Simulation Completion

This release is cumulative from 16.90.0. It corrects the release identity in VERSION, package metadata and RELEASE-MANIFEST.json, and expands the isolated simulation scenario catalog from five to eight scenarios.

### Implemented in source

- Added late-delivery and escalation simulation. It produces explicitly simulated deadline-breach evidence and a blocked/escalation-required result.
- Added missing-delivery-proof simulation. Verification remains blocked and the simulated outcome is not certified.
- Added cancellation-before-execution simulation. The scenario blocks before assignment/execution and records that no physical effect occurred.
- Added the three scenarios to the simulator UI and expanded the existing simulation contract test.
- Preserved simulation-only labeling, virtual executor profiles, no-production-mutation and no-device-command invariants.
- Corrected release documentation identity to 16.91.0. Migration high-water remains 0166; no database migration is introduced.

### Not claimed complete by this release

- The simulator is deterministic and isolated; it is not a live customer pilot or production mission.
- Provider OAuth/credential authorization and live connectivity are not completed by adding provider requirements to a market package.
- Legal review, controller identity, VAT decisions, data residency/subprocessor proof and approvals remain external decisions.
- Authenticated production browser testing, tenant-isolation runtime attacks, D1 restore drills, regional placement proof and real customer pilot certification remain outstanding.
- A unified four-workspace Super Admin redesign and full Mission Operations Control Center are not certified as complete in this release.

### Verification vocabulary

Source tests and simulation evidence are not production evidence. The release may be called source-tested only after the cumulative release and health checks pass in the required Node 24.22.1 environment. Deployment, production verification, approvals and pilot certification remain separate gates.
