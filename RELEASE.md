# Mission Execution 16.61.0 — Unified Resource Control Plane and Lifecycle UX

Status: hardening candidate

Base: 16.59.0

## Changes
- Added an asset-family filter to canonical Resource Management inventory, using the existing asset contract family classifier. This is a presentation filter only; it creates no records or alternate authority.
- Reorganized the single Resource shell around Inventory, Asset Studio, Overview, Dependencies, Lifecycle and Changes & Audit. Added contextual workspaces populated only from the selected asset response.
- Replaced generic lifecycle confirmation copy with action-specific consequences for stop, start, reactivate, quarantine, restore and permanent purge. The confirmation includes canonical type, identity and revision when available.
- Kept lifecycle mutation routed through the existing canonical resource action adapter. Non-purge actions re-read the resource and refresh inventory after the owner responds.
- Preserved the existing owner capability checks, step-up authorization, dependency checks, concurrency fences, canonical read-back and audit paths.

- Added regression checks for identity omission and Product Factory owner routing.

## Explicit boundaries
- Asset family remains a client-side classification derived from the current trusted type definitions; it is not yet explicit server-owned family metadata.
- This release does not introduce generic cross-domain deletion, cascade deletion, new lifecycle authority, or a parallel asset database.
- Relationship graphs and impact previews show only evidence exposed by the canonical owner; they are not a universal dependency proof.
- The earlier unsupported Product Definition edit and Sector HTTP 409 must still be diagnosed against authenticated request/response traces. Removed immutable code fields from client edit payloads so the server merges canonical identity from the owner record. Product Definition records bypass unsupported generic Data Studio inspection and route to Product Factory. These changes address the known failure paths at source level; live authenticated confirmation is still required.

## Verification
- See the 16.61.0 release check for source-level assertions.
- Production deployment, authenticated browser tests, live mutation/read-back checks, Node.js 24 full build and Germany Logistics pilot certification remain unverified in this environment.

## Historical cumulative milestones
- 16.17.0 — Market Cleanup and Guided Intake

## 16.61.0 — Adaptive Asset Update Patch Safety

- Asset Update now submits a sparse patch containing only fields whose normalized values differ from the canonical record.
- Immutable identity and scope fields are excluded from generic edit payloads.
- Empty changes are blocked before preview, preventing no-op commits.
- Numeric and boolean fields are normalized against the server-provided field schema before dirty-field comparison.
- Existing server-side contract enforcement, mutation lease, optimistic concurrency, owning-authority commit and read-back verification remain in place.
- This release does not claim to implement all six asset-family workspaces or all cross-authority relationship operations; those require per-authority contracts and runtime certification.
- Verification: full configured `npm run check:release` chain passed under Node 22.16.0. Production build remains blocked by the repository's Node 24.x build gate in this local environment.

## 16.62.0 — Reference-Inspired Split-Pane Asset Library

- Reworked the Resource Management inventory into a persistent two-pane Asset Library and Asset Configuration workspace.
- Added family filter chips with counts derived only from the currently returned canonical inventory; filters remain scoped to the returned result set.
- Kept the existing type and lifecycle filters available in the underlying controls, while presenting the common family navigation as compact chips.
- Added selected-asset highlighting and clearer library/configuration headings.
- Applied a responsive layout: side-by-side on wide screens and stacked on narrow screens.
- Preserved canonical resource search, authority capability inspection, owner-workspace routing, dependency/impact inspection, governed edit, lifecycle action gates, and existing create/preview/commit flows.
- No sample asset records were inserted; displayed counts are computed from the actual inventory response.
- Verification: full configured `npm run check:release` chain passed under Node 22.16.0; Resource Management JavaScript syntax check passed.
- Production build was blocked at the Node version gate: local runtime 22.16.0, required Node 24.x. Browser, D1, and production deployment verification remain outstanding.

## 16.63.0 — Asset Flow Audit & Outcome Continuity

### Audit findings and fixes
- Confirmed the canonical edit path: Resource Library selection → capability inspection → owner-routed Asset Studio/Data Studio → sparse dirty-field patch → contract and scope validation → mutation lease and optimistic concurrency check → canonical owner mutation → independent read-after-write comparison → lifecycle/audit evidence.
- Fixed compact Asset 360 update handling so a commit with missing verification, failed read-back, or pending evidence is surfaced to the administrator even when the parent Asset 360 view refreshes. The message explicitly says not to retry an ambiguous mutation.
- Fixed selected-asset continuity: the library row now carries canonical type and ID and updates its selected visual state immediately when selected, without requiring another search/filter cycle.
- Preserved owner routing for Product Definition and capability-gated editing for other supported types.
- Confirmed the 25 resource types listed in the Data Studio edit capability set; other asset authorities remain owner-workspace only or inspect-only where not granted.

### Verification
- Full configured `npm run check:release`: PASS.
- `check:security`, `check:data-integrity`, `check:production-readiness`, `check:production-hardening`, `check:lifecycle-contract`, and `check:current-architecture-convergence`: PASS.
- Architecture: 0 local import cycles; one canonical mission lifecycle writer.
- Data integrity output retains protected deletion policies for mission and executor identity records.
- Production-readiness gate notes migration 0036 must be applied before relying on its new indexes.
- Build remains blocked locally by Node 22.16.0 versus required Node 24.x.
- Authenticated browser, live D1 mutation, production deployment, and Germany Logistics pilot verification were not run in this environment.

### Explicit remaining gaps
- Typed relationship selection/editing is not yet a complete universal workflow; current editors expose contract fields and some relation hints, but this release does not certify a searchable multi-select reference picker for every asset family.
- Lifecycle actions are offered only from authority-reported capabilities; this release does not certify every transition for every asset type.
- Production runtime and database outcomes remain unverified until deployed and exercised against the target D1 environment.
