# Human Work Model — Wave 3 Surface Conversion

## Release

10.92.0 — Human Work Model Wave 3: Surface Conversion

Base: 10.91.0 — Canonical HumanWorkItem Contract

## Bounded achievement

Wave 3 converts actionable cross-domain operational surfaces into the canonical Human Work presentation without moving domain authority into the Human Work Model.

### Converted into Human Work

- Mission operational work continues through the canonical Mission Workspace.
- Network mission invitations are represented as `HumanWorkItem` records with `sourceAuthority: network`.
- Organization trust requests are represented as `HumanWorkItem` records with `sourceAuthority: network`.
- ForYou mission-access requests are represented as `HumanWorkItem` records with `sourceAuthority: network`.
- The Work queue now composes mission and non-mission work in one operational surface.
- Non-mission work opens a bounded Work detail context instead of creating another page family.
- Collaboration mutations are executed through the canonical Action Client / Action Registry boundary.

### Deliberately contextual, not fake work

People, Objects, identity, subscription, privacy and other stable reference information remain contextual surfaces. They are not fabricated as work merely to satisfy the convergence model. Their contextual workspace convergence belongs to Wave 4.

## Human interaction model

```text
WORK
  ↓
Situation
  ↓
Why it matters
  ↓
Context
  ↓
One primary action
  ↓
Evidence
  ↓
Result / refreshed situation
```

Today remains the focus surface. Work is the universal operational surface. Contextual workspaces remain the place for deeper understanding.

## Security and architecture boundary

- Human Work is presentation/composition only.
- Mission, assignment, network, product, people and object authorities remain canonical.
- Collaboration mutations use the existing secured Action Registry path.
- No direct network/trust/ForYou mutation endpoint is introduced by the Work surface.
- Optional cross-domain read projections use `Promise.allSettled` and explicit degraded state; failures are not silently converted into empty authoritative data.
- Tenant scoping and role authorization remain enforced by the existing APIs.
- Control Plane remains separate.
- No D1 migration is introduced; high-water remains 0124.

## Wave 3 exit criteria

1. Actionable collaboration work is represented by `HumanWorkItem`.
2. Mission work remains routed to canonical Mission Workspace.
3. Network/trust/mission-request mutations use canonical action execution.
4. No second work-item schema is introduced.
5. People and Objects are not misrepresented as actionable work.
6. The existing release certification chain remains green.

## Next wave

Wave 4 — Contextual Workspaces: converge Mission, Person, Organization, Network Relationship, Object and Product contexts into clean, reusable workspace compositions without creating duplicate domain authorities.
