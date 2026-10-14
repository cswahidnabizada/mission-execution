# ON Mission — Permanent Release Quality Gates

Every future release must satisfy all gates before it is considered complete.

## Architecture

- 0 import cycles
- 1 canonical authority per domain
- 0 duplicate authorities
- 0 obsolete routable implementations

## Security

- tenant isolation
- authorization
- step-up controls
- CSRF/origin protection
- rate limits
- CSP
- HSTS
- data classification
- audit

## Truth

- one mission truth
- one assignment authority
- one lifecycle writer
- one action registry
- one product contract
- one release authority

## Release

- immutable contract snapshot
- dependency snapshot
- exact release state machine
- authorization
- publication
- verification
- rollback
- release-operation reconciliation

## Test Lab

- registration
- tenant
- executor
- mission
- assignment
- execution
- evidence
- completion
- security
- commercial
- recovery

## UI

- simple
- semantic
- one primary action
- no duplicate workspace
- no unexplained errors
- no raw JSON unless Advanced
- no hidden authority
- no accidental destructive activation
- every card, button, control and action must work against the canonical backend authority

## Production

- clean install
- build
- schema gate
- migration gate
- release gate
- runtime certification
- adversarial certification
- recovery certification
- real-user test
- protected baseline

## Journey rule

After every release, audit the complete system and the downstream journey. If a change affects another subsystem, unify the change with the affected authority, projection, API, UI and tests rather than patching only the immediate file. The release is complete only when the end-to-end system works as a connected product.
