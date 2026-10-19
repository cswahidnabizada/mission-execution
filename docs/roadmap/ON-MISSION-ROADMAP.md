# ON MISSION — Canonical Roadmap and Release Continuity

This document is a durable handoff between releases. The machine-readable source of truth for roadmap sequencing is `config/roadmap/mission-execution-roadmap.json`; update both only when a release changes a milestone, dependency, or exit criterion.

## Permanent engineering priorities

**Security → Truth → Liveness → Stability → Experience → Scale**

Canonical journey:

`OBSERVE → UNDERSTAND → PLAN → EVALUATE → ACCEPT → AUTHORIZE → PREPARE → ASSIGN → EXECUTE → EFFECT → VERIFY → RECOVER → OUTCOME → LEARN → NEXT SITUATION → OBSERVE`

## Current checkpoint: 16.10.77

- 16.10.70: simulation foundation.
- 16.10.71: append-only simulation records and content hashes.
- 16.10.72: Super Admin simulator navigation.
- 16.10.73: tenant-scoped simulator endpoints and workspace.
- 16.10.74: simulation planning adapter, constraints and deterministic replay.
- 16.10.75: virtual device safety profiles.
- 16.10.77: roadmap continuity and explicit certification gates.

Cloudflare logs supplied for 16.10.75 confirm a successful asset upload and Worker deployment. They do **not** establish authenticated browser certification, adversarial cross-tenant HTTP denial, vendor/device integration, or physical effect certification. Keep these gates open until evidence is captured.

## Simulator completion sequence

1. Authenticated browser certification: Super Admin and tenant save/history/reload/replay, failure handling and accessibility.
2. Adversarial tenant/role verification over HTTP, including foreign run IDs, forged tenant context, replay conflicts and unauthenticated requests.
3. Canonical planner integration through read-only contracts; compare expected and observed outcomes without creating another planner authority.
4. Vendor simulator sandbox, then software-in-the-loop. Hardware-in-the-loop requires separate device-specific safety approval and remains disabled until approved.
5. Germany logistics end-to-end: normal delivery, blocked assignment, failed delivery, recovery, evidence verification, outcome and next situation.

## Broader platform roadmap after simulator certification

1. Governed action orchestration.
2. Unified Platform Control and shared work queue/resource visibility.
3. Infrastructure, data, experience and content centers.
4. Integration and AI capability centers.
5. Market Factory and tenant activation.
6. Controlled, certified real-world mission execution, beginning with Germany logistics.

## Architecture guardrails

- One canonical authority per domain; the orchestrator coordinates but does not become a second mission, authorization, capability, resource, or release authority.
- Prefer extending existing services and registries over creating a new service/backend for each control center.
- Simulation runs, replay fingerprints, caches, and learned weights are derived evidence, never canonical mission truth.
- Simulation success never grants live authorization or proves a physical effect.
- Production changes follow the existing immutable release lifecycle, authorization, verification and rollback gates.
- Every release updates the checkpoint and records what is implemented, runtime-verified, blocked, and still pending.


## 16.10.78 — Simulation Integration Certification

This release adds deterministic certification contracts for the existing canonical planning adapter, a local vendor-simulator contract harness, software-in-the-loop (SIL) fault fixtures, a fail-closed hardware-in-the-loop (HIL) interlock, and Germany logistics end-to-end scenario contracts. These are test harnesses and readiness controls, not proof of deployed browser behavior, third-party vendor compatibility, physical device safety, or real delivery.

### Certification boundaries
- Canonical planning remains read-only from the simulation harness; it does not create, accept, or mutate live mission plans.
- Vendor simulation is local and deterministic. No production network connection, API key, or physical-device transport is introduced.
- SIL fixtures test normal response, timeout, malformed output, safety-envelope violation, and heartbeat loss.
- HIL stays disabled by default and rejects actuation without an explicit device-specific certification record; this release does not provide that approval.
- Germany logistics scenarios cover normal delivery, blocked assignment, failed delivery with recovery, and independent evidence verification. All evidence is marked simulated.
- External vendor, browser, authenticated HTTP, physical hardware, and real-world Germany pilot gates remain pending until independently evidenced.
