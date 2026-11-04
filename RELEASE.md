# ON Mission 16.93.0 — Unified Markets & Market Launch Studio

## Release summary

16.93.0 is cumulative from 16.92.0. It reshapes the Market Factory entry surface into a unified Markets portfolio and a single guided workspace for each selected market. The launch workbench now presents nine stable journeys, while continuing to consume canonical Market Factory tasks, resource authorities, immutable package versions and the evidence-gated release lifecycle.

## Implemented in source

- Reframed the Super Admin entry surface as **Markets**, with a portfolio summary for all markets, live markets, drafts/preparing markets and retired markets.
- Added market cards with lifecycle status, release version, launch-readiness percentage/progress bar, version count and onboarding mode.
- Added a direct **Create Market** entry point that opens the guided staged-market form.
- Added live-market operational visibility slots for platform database health, mission execution health, customer/active-user counts, connections and errors. Values that are not supplied by a market-scoped canonical telemetry authority are explicitly marked unavailable/pending; platform-wide counts are not misrepresented as market-specific metrics.
- Reorganized each market's launch workbench into nine fixed journeys: Market Definition; Resource Preparation; Product & Pricing; Policies & Legal; Providers & Infrastructure; Tenant Onboarding; Mission Operations; Final Certification; Publication & Activation.
- Each journey filters the canonical task register and exposes the existing governed task/evidence forms and context-sensitive typed resource preparation. Existing structured package editing remains available for supported market configuration fields.
- Added responsive portfolio, live-health and nine-journey navigation styling.
- Added market version count to the existing canonical market list projection without adding a competing data registry.
- Preserved immutable package versions, canonical resource ownership, step-up authorization, publication recovery, verification and activation gates.
- No database migration; migration high-water remains 0166.

## Important product boundaries

- The nine journeys are a stable UX model over existing canonical tasks. This release does not invent nine new backend authorities or bypass the task contracts.
- Not every resource type has a bespoke field-level form yet. Supported typed resource definitions and the existing structured package editor are used; advanced JSON remains available for unsupported package structures.
- Per-market customer counts, active users, execution health, connection health and error counts are not fabricated. The card makes the missing market-scoped telemetry visible until the owning authorities expose those measures.
- A readiness percentage is a package/workbench assessment, not a legal approval, production certification or proof of real-world mission outcomes.
- Live status remains owned by the canonical market lifecycle. The supervisor does not publish, verify, activate or open public onboarding automatically; these transitions remain separately gated.

## External certification still required

1. Legal counsel approval, controller identity, privacy notice, terms, imprint and lawful processing decisions.
2. Provider selection, credentials, OAuth authorization, contracts, subprocessors and live integration tests.
3. Verified physical location and jurisdiction of D1, KV, R2, Vectorize, logs, observability, backups, support and every subprocessor.
4. Backup restore execution and independently reviewed recovery evidence.
5. Authenticated production browser tests, tenant-isolation attacks, step-up authorization, concurrency and stale-revision tests against the deployed Worker.
6. Real Germany customer onboarding with verified organization and authorized human users.
7. A supervised logistics pilot with real mission execution evidence, physical mission evidence, delivery proof and outcome verification.
8. Authorized publication, verification, activation and onboarding opening.

## Verification status

This release does not certify external legal, provider, residency, customer or physical mission facts. Static source checks can prove implementation contracts, not live runtime facts. Run the full release and health gates in the required Node 24.x environment. The current build environment reports Node 22.16.0, so the Node 24 build gate must be run in the configured Cloudflare build environment. Deployment, production verification, approvals and pilot certification remain separate states.

## Deployment

- Use Node 24.22.1 and npm 10.x.
- Run `npm ci`, `npm run build`, `npm run check:release`, `npm run check:health`, `npm run check:migrations`, and `npm run check:super-admin-build`.
- No new migration is required by 16.93.0.
- Deploy the Worker using the established Cloudflare pipeline.
- In Super Admin, open **Markets**. Review the portfolio and use **Create Market** or open the existing Germany Logistics market.
- In a market workspace, progress through the nine journeys, use the next required task and canonical typed resource tools, save only as new immutable package versions, and reassess readiness.
- Do not publish, verify, activate or open public onboarding until the canonical release lifecycle and independent approvals authorize those transitions.

## 16.94.0 — Nine-stage typed configuration

This cumulative release adds a dedicated configuration form to each of the nine journeys. Typed scalar controls and repeatable collection editors cover market definition, sectors/capabilities, subscriptions/billing, policies/legal/content, provider and integration requirements, onboarding mode and mission operations. Each save uses the existing Market Factory import authority to create a new immutable package version, selects the server-returned version and reloads canonical workbench/certification state. Market country and product identity cannot be changed through a revision.

Certification and activation remain evidence- and authorization-driven; they do not expose manual completion toggles. Package forms edit staged package data only. Canonical resource mutations, relationships, provider credentials, legal approval, actual region placement, tenant access and physical mission outcomes remain owned by their existing authorities or external reviewers.

This release does not certify legal approval, provider authorization, actual data residency, production security, customer onboarding or real mission outcomes. Physical mission evidence must come from a real supervised customer pilot; simulation does not replace it. The supervisor does not publish, verify, activate or open public onboarding automatically.


## 16.95.0 — Intelligent market dependency resolution

This cumulative release upgrades the nine-stage market configuration forms with a canonical dependency preflight. Before a staged package revision is saved, the form inspects resource-like collection entries against the canonical resource-search endpoint. Exact candidates are classified from their returned status where the status vocabulary is recognized (available, needs configuration, requires approval, blocked); unknown statuses remain candidates for review. Search misses are explicitly labeled as not found in the current search scope, never as proof that a resource does not exist.

The administrator receives a dependency assessment before save and must explicitly confirm the immutable package revision. A canonical search failure pauses the save. Existing candidates are not automatically mutated or linked. The staged package is saved through the existing Market Factory import authority with step-up authorization; the server-returned version identity is selected and the workbench is refreshed so canonical readiness is recalculated. Duplicate staged identities are rejected within each collection. Country ISO formatting is validated while immutable market/product identity is preserved.

This is a dependency preflight and safe staged-package save workflow, not an automatic resource-linking engine. Canonical resource creation, editing and relationships continue through their owning services. A search miss is not a definitive missing-resource determination; the resource authority must be consulted before creating a new record. Live telemetry, legal/provider approval, physical residency evidence, production security certification and real customer mission outcomes remain external or separately owned proof obligations.

## 16.95.0 deployment

- Use Node 24.22.1 and npm 10.x.
- Run `npm ci`, `npm run build`, `npm run check:release`, `npm run check:health`, `npm run check:migrations`, and `npm run check:super-admin-build`.
- No new database migration is required; migration high-water remains 0166.
- Deploy through the established Cloudflare Worker pipeline.
- In a draft market, edit a resource collection in one of the nine stages. Review the dependency assessment and candidate statuses, then explicitly confirm the save.
- Confirm the server-returned market version is selected and the canonical workbench/certification assessment refreshes.
- Do not treat search misses as proof of absence, or candidates as automatic links. Do not publish or activate without the existing authorized release lifecycle.
