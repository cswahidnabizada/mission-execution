# ON Mission 16.66.0 — Canonical Resource Relationship Engine · Cumulative Candidate

Base: 16.65.0

## Implemented
- Added a canonical relationship authority for `depends_on` edges between already-existing canonical resources.
- Endpoints are resolved through Data Studio's canonical inspection path; unsupported resource types are rejected instead of accepted as unverified text.
- Relationship previews re-resolve both endpoints, enforce supported relationship types, reject self-references, and compare tenant and country/market scope when those scopes are present.
- Dependency cycle detection blocks a new edge when it would introduce a cycle.
- Added read/list API for active relationships on either endpoint.
- Added Asset 360 search-and-select UI using the canonical Resource Search endpoint, plus governed connect and disconnect actions.
- Merged persisted relationship edges into the Resource Explorer graph so refresh shows the committed relationship.
- Added a read-only canonical Product Definition endpoint lookup for relationship edges; Product Factory remains the edit authority.
- Added step-up protected commit and removal operations, critical audit intent/completion, unique edge identity, and independent row read-back.
- Removal is a durable `removed` state, not destructive deletion.
- Added migration 0164 and current-schema snapshot update.
- Relationship operations create no endpoint assets and preserve canonical owner authority.

## Deliberate scope boundaries
- This release currently supports the generic `depends_on` relationship only.
- Product Definitions are supported as read-only relationship endpoints through the Product Definition owner query. Product Factory edit routing and full Product Factory/Market Studio convergence remain open for 16.69.0.
- The first relationship schema is platform-scoped; tenant/market scope compatibility is checked from owner-returned endpoint records. More nuanced cross-market relationship policy requires owner-specific contracts.
- Existing Product Launch dependency graph remains separate; convergence is part of Asset 360 / Market Studio work.

## Verification
- See `RELEASE-REPORT.txt`.
- Source candidate only; not deployed or live-certified.

## Protected platform baseline continuity
This resource-management release preserves the established ON Mission platform boundaries:
- Global Compliance Context, Consent & Privacy, and Data Subject Rights remain governed platform concerns; this release does not replace their owning authorities.
- Private ForYou remains a distinct product experience and is not treated as a resource identity or tenant boundary.
- Canonical domain ownership, canonical capability contracts and canonical vocabulary remain server-authoritative.
- Logistics remains the pilot sector. Historical Cargo terminology is not introduced as a new authority; the current product vocabulary remains Object.
- `database/schema.current.sql` is updated alongside ordered migrations. The deterministic release pipeline and migration contract checker remain required release controls.

The **canonical domain** owns resource truth. A governed **Capability** is an explicit contract and is not inferred from a UI control.

---

# ON Mission 16.70.0 — Resource Management Completion Integration · Final Source Candidate

Base: 16.66.0

## Implemented in this cumulative candidate
- Preserved the 16.64 canonical identity normalization, 16.65 schema-driven typed resource forms, and 16.66 canonical relationship engine.
- Added a permission-checked Asset 360 lifecycle-history endpoint. The route first resolves the resource through Resource Explorer, then returns owner-associated lifecycle events.
- Connected Asset 360 Changes & Audit to the lifecycle history endpoint. The UI distinguishes returned lifecycle evidence from missing evidence and does not interpret an empty history as proof that no changes occurred.
- Removed generic START / REACTIVATE buttons from the Resource Management surface because the generic action route does not implement those transitions through a registered owner adapter. This prevents presenting unsupported controls as operational.
- Added a cumulative integration regression test for lifecycle history routing, authorization, UI evidence rendering, relationship scope/cycle protections, and release identity.
- Retained existing Market Factory, Product Factory, controlled launch, product readiness and mission lifecycle capabilities without creating parallel market or product records.
- Updated release identity, cache-busting references, release manifest and release verification documentation.

## Verification performed for this candidate
- 16.70 integration regression test.
- Cumulative 16.66 release suite.
- Security, data integrity, production readiness, production hardening, lifecycle contract and architecture convergence checks.
- Migration contract, release engineering, dependency lock and single-release-source checks.
- JavaScript syntax checks for changed files.
- SQLite migration smoke test for migration 0164 was already part of the 16.66 baseline; no production D1 application is claimed.

## Explicitly not certified
- Production Node 24 build. This environment has Node 22.16.0; the repository requires Node 24.22.1.
- Authenticated browser tests against the deployed Worker.
- Live Cloudflare D1 mutations or independent read-after-write verification.
- Production application/verification of migrations 0036 and 0164.
- Germany Logistics pilot launch and real mission execution.
- Every resource-family create/edit path and all owner-specific lifecycle adapters.
- Sector HTTP 409 reproduction and Product Definition HTTP 422 correction against authenticated live request traces.
- Generic activate/resume transitions. They must be implemented by explicit canonical owner adapters; the UI no longer exposes generic unsupported start controls.

## Remaining programme
1. Resolve Sector canonical edit HTTP 409 using authenticated request/response traces.
2. Route Product Definition edits through Product Factory and certify preview/commit/read-back.
3. Certify create/edit/read-back for every resource family and every typed schema.
4. Expand relationship semantics only with explicit owner contracts; certify scope policies and cross-tenant denial.
5. Complete owner-specific activate/publish, suspend, resume/restore, retire/archive and safe deletion transitions with audit, legal holds, dependency checks and idempotent recovery.
6. Complete dependency impact analysis across all canonical owners and audit/activity convergence.
7. Complete Germany Logistics Product Factory → Market Studio → Test Lab → approval → signed release → launch → operations journey.
8. Apply and verify migrations 0036 and 0164 in production.
9. Run Node 24.22.1 production build, authenticated browser tests, live D1 mutation/read-back and recovery tests.
10. Complete end-to-end tenant isolation, market scope, authorization, concurrency and Germany pilot certification.

## Permanent engineering rules
Security → Truth → Liveness → Stability → Experience → Scale.
Canonical mission journey: OBSERVE → UNDERSTAND → PLAN → EVALUATE → ACCEPT → AUTHORIZE → PREPARE → ASSIGN → EXECUTE → EFFECT → VERIFY → RECOVER → OUTCOME → LEARN → NEXT SITUATION → OBSERVE.

## 16.72.0 — Owner Boundary & Canonical Identity Hardening

Base: 16.70.0

Implemented:
- Product Definition's Asset 360 "Edit Configuration" route now explicitly returns an owner-workspace instruction and opens Product Factory. It does not mount the generic Data Studio editor or send generic preview/commit requests.
- Sector and other code-keyed resource identity validation now recognizes the owner-held canonical key when the projection exposes it as `resourceId`, `resource_id`, or `id` rather than a `code` column. This avoids comparing a valid canonical key against an empty projected code while retaining rejection of an actual changed identity.
- Added a focused regression contract for the Product Factory owner boundary and canonical identity fallback.

Limitations:
- This source-level change does not prove the exact production Sector HTTP 409 is resolved; the production request trace remains necessary to establish its actual payload and database projection shape.
- Owner-specific lifecycle adapters, complete semantic relationship contracts, legal-hold deletion, full Asset 360 convergence, Germany Logistics Test Lab and signed launch, and authenticated production certification remain separate outstanding work. No live production changes are claimed.


## 16.72.0 — Safe Relationship-Aware Deletion Guard

Base: 16.71.0.

- Added a canonical active-relationship dependency check to governed quarantine and permanent purge paths.
- A resource with active inbound or outbound canonical relationships is blocked from quarantine and purge with `TRASH_RELATIONSHIP_DEPENDENCIES`; relationships must be disconnected through the relationship authority first.
- The relationship check is repeated at purge time to close the gap between initial quarantine and later permanent deletion.
- Preserved legal-hold enforcement and existing owner-specific deletion behavior.
- No schema migration added; migration high-water remains 0164.
- Added a cumulative regression contract for both deletion gates.

This release does not claim to implement missing owner-specific lifecycle adapters, all semantic relationship types, or production certification.


ON MISSION 16.73.1 — RESOURCE CAPABILITY REGISTRY & CERTIFICATION BOUNDARIES
Base: 16.72.0
Status: cumulative source candidate; production deployment and authenticated runtime certification remain pending.

IMPLEMENTED
- Added an authenticated read-only Resource Management capability endpoint: GET /api/platform/admin/resource-management/capabilities.
- Capability output is derived from the canonical reusable resource definitions and existing Trash owner mappings; it exposes owner authority, editable fields, quarantine/restore/permanent-delete support and deletion policy.
- Explicitly reports that generic activate/suspend/resume/retire operations are NOT implemented by the Trash adapter; the UI/API must not infer those capabilities.
- Explicitly reports that semantic relationship types remain limited to depends_on pending owner-approved semantic contracts.
- Added a cumulative contract test covering all reusable resource-family definitions, owner-table mapping, fail-closed lifecycle capability reporting and Germany Logistics simulation/pilot approval boundaries.
- No database migration added; existing 164-migration lineage retained.

VERIFICATION
- New 16.73.1 capability registry contract: PASS.
- Cumulative release suite: to be run in this build session.
- Node 24 production build: environment-dependent; runner currently provides Node 22.16.0 while .node-version requires 24.22.1.
- Production D1, authenticated browser, live API, Germany Logistics pilot: not run from this source build.

IMPORTANT LIMITATIONS
- This release makes lifecycle capability boundaries explicit; it does not invent missing owner-specific activate/suspend/resume/retire adapters.
- Semantic relationships beyond depends_on remain blocked until their canonical owners register and validate endpoint contracts.
- Germany Logistics remains a simulation fixture; simulation cannot certify physical delivery or authorize production execution.


16.73.1 VERIFICATION ADDENDUM
- `node tests/system/check-16-73-0-resource-capability-registry.mjs`: PASS (26 reusable resource families checked; capability reporting fails closed for unimplemented generic lifecycle actions; Germany simulation/pilot policy flags retained).
- `npm run check:release`: PASS (cumulative suite; includes 16.73.1, 16.72.0, 16.71.0 and historical resource contracts).
- `npm run check:security`: PASS.
- `npm run check:data-integrity`: PASS.
- `npm run check:production-readiness`: PASS (source/data/index contracts); script notes production migration 0036 must be applied before relying on indexes.
- `npm run check:production-hardening`: PASS.
- `node scripts/check-migration-contract.mjs`: PASS (164 ordered migrations; high-water 0164).
- `node scripts/check-release-engineering.mjs`: PASS (version 16.73.1; schema snapshot retained).
- `node scripts/check-dependency-lock.mjs`: PASS.
- `node --check` changed route and Trash service: PASS.
- Architecture scan in cumulative release gate: PASS (427 JS files, 1,617 local imports, zero cycles; one canonical mission lifecycle writer).
- `npm run build`: BLOCKED before CSS compilation because this runner is Node 22.16.0; project `.node-version` requires Node 24.22.1.
- No live Cloudflare/D1/authenticated browser/physical Germany Logistics pilot tests were run.

DEPLOYMENT NOTE
The new read-only endpoint is `GET /api/platform/admin/resource-management/capabilities`. It requires platform-administrator authentication. It reports current canonical owner/edit field metadata, actual Trash capabilities, and explicitly marks generic activation/suspension/resume/retirement as unsupported. It also states that semantic relationship types beyond `depends_on` are pending owner-approved contracts.


## 16.73.1 — Resource Capability Registry 500 Hotfix

- Fixed the capability-registry route handler to receive the request environment (`env`) from the router context before platform-administrator authorization. The previous handler referenced an out-of-scope `env`, causing an HTTP 500 for authenticated requests.
- Strengthened the 16.73.1 capability-registry regression test to assert the route receives `{request, env}` and passes that environment to `requirePlatformAdministrator`.
- No database migration or data mutation is introduced by this hotfix.
- This is a targeted production hotfix; it does not implement the owner-specific lifecycle adapters planned for 16.74.0.
