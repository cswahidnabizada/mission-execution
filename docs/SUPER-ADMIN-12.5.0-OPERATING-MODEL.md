# ON Mission 12.5.0 — Super Admin Operating Model

## Purpose

Super Admin is the **Control Plane**. It orchestrates the platform; it does not become a second domain authority.

The operating rule is:

**Discover → Understand → Decide → Governed Action → Verify → Continue**

Canonical domain services remain the owners of truth.

## Primary navigation

1. **COMMAND** — What is happening, what requires attention, and which governed action is next.
   - Command Center
   - Administrative Operations
   - Action Matrix
   - System Health
   - Agentic Control
2. **RESOURCES** — The single platform resource discovery and management boundary.
   - Resource Workspace
3. **BUILD** — Construct product foundations and product composition from canonical Resources.
   - Product Factory
   - Product Countries
4. **RELEASE** — Prove and authorize a product version.
   - Release Center
   - Test Lab & Verification
   - Verification & Trust
   - Certification
   - Dependency Impact
5. **LAUNCH** — Move an authorized product into live country/sector operation.
   - Launch Center
   - Product Monitor
6. **OPERATE** — Manage organizations, access, commercial state, missions and communications through their canonical authorities.
   - Organizations
   - People & Access
   - Subscriptions
   - Billing
   - Missions
   - Communication
7. **GOVERN** — Policies, privacy, residency, providers, analytics, security and audit.
   - Human Platform
   - Policies
   - Consent & Privacy
   - Privacy Rights
   - Residency
   - Providers
   - Analytics Governance
   - Security
   - Global Audit
8. **RECOVER** — Restore continuity without inventing truth.
   - Backup & Recovery
   - Recovery & Reconciliation

## Resources is the canonical data operating surface

Resources is the only primary navigation entry for generic platform resource discovery and reusable-data management.

The following are implementation authorities, not competing navigation destinations:

- Data Entry — governed creation pipeline.
- Data Studio — governed reusable-resource editing.
- Data Control — lifecycle controls for supported resources.
- Trash — quarantine, restore and purge authority.
- Resource Explorer — compatibility/action bridge only; it does not render a second drawer UI.

## Resource Workspace contract

A selected record has four working tabs:

- **SUMMARY** — canonical record facts, authority, state and currently valid actions.
- **RELATIONSHIPS** — dependencies and dependents derived from canonical data; every node can be opened.
- **LIFECYCLE** — current canonical state and lifecycle boundary; no UI state is treated as truth.
- **CHANGE** — Data Studio when the resource is a reusable governed type; otherwise the resource's owning canonical workspace.

Actions are executable, not decorative. They must call the canonical mutation boundary and require step-up where the server requires it.

## Resource read invariant

Search results are discovery projections. After selection, the workspace must re-read the exact record from its owning canonical authority using a deterministic resource-type reader.

It must **not** rehydrate the selected record by invoking a broad search/list projection with a different query or readiness contract.

This prevents a valid search result from becoming an unrelated projection failure in the workspace.

## Sector invariant

A global reusable Sector is owned by `platform_reusable_sectors` and is available everywhere through the canonical reusable Sector authority.

`platform_country_product_sectors` remains a separate relationship authority for attaching a Sector to a specific Country Blueprint. It is not the global Sector catalog.

## Mutation invariant

Super Admin never writes arbitrary SQL and never creates generic shadow truth.

- Create: Data Entry → validation → canonical authority.
- Edit reusable data: Data Studio → canonical reusable authority.
- Lifecycle: Data Control / Trash → canonical lifecycle authority.
- Product: Product Definition / Product Factory authority.
- Launch: Country Product Launch authority.
- Mission: Mission authority.
- Privacy erasure: Privacy Erasure authority.
- Agent decisions: advisory/governed agent boundary; never a truth or authorization source.

## Failure contract

If a canonical read fails, the UI displays **AUTHORITY UNAVAILABLE** and does not manufacture empty, cached, guessed or default truth.

If an action fails, the UI reports that no successful mutation was confirmed and keeps the current canonical state until it is re-read.

## Protected priorities

**Security → Truth → Liveness → Stability → Experience → Scale**
