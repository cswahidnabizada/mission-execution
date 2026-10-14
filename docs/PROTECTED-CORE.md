# ON Mission — Protected Core Contract

## Purpose

From 12.1.0 onward, the Canonical Core is a protected production boundary. Product, UI, agentic and provider features may compose or project the core, but they must not create a second authority.

## Canonical authorities

- Mission truth: canonical mission/lifecycle authority.
- Assignment: canonical assignment authority.
- Actions: Canonical Action Registry + Action Service Map + canonical action execution service.
- Authorization: canonical authorization/role/step-up boundaries.
- Product: Product Contract + canonical product definition/release lifecycle.
- Launch: Country Product Launch authority.
- Provider effect: External Provider Integration; provider success is evidence, not mission truth.
- Verification: canonical verification/state reconciliation.
- Recovery: canonical recovery/reconciliation authority.
- Outcome: append-only outcome/evidence ledgers; learning remains advisory.

## Non-negotiable rules

1. New functionality attaches to an existing authority or is explicitly introduced as a new authority with a release-gate migration and retirement plan.
2. UI projections never become mutation authorities.
3. Agentic intelligence never creates truth, authorization, policy or execution permission.
4. Provider effects never become canonical mission truth without authoritative verification.
5. UNKNOWN is never silently converted to success or replayed blindly.
6. Canonical database failures are explicit `AUTHORITY_UNAVAILABLE`/HTTP 503 states where applicable; no empty fallback may represent canonical truth.
7. Every non-terminal mission must have a valid next action or explicit waiting condition.
8. Operational surfaces expose one current action first; additional operations remain discoverable without competing primary actions.
9. Historical compatibility tests may remain, but obsolete routable implementations and duplicate authorities must be retired.
10. No fake customer, provider, mission, outcome or recovery data is seeded merely to make an empty launch surface look healthy.

## Engineering protocol

`Inspect → reuse authority → make the smallest safe change → remove obsolete implementation → release-gate → deploy → real-runtime proof → protect baseline.`

## Launch proof

The first test product must prove:

`Product scope → country foundation → product definition → release → verification → launch → customer → mission → execute → verify effect → outcome → recovery → learning.`

12.1.0 changes the presentation and release safeguards for this journey; it does not weaken the canonical execution boundary.
