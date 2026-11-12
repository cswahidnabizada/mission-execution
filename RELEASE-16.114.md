# ON Mission 16.114.0 — Operational Controls Completion Wave

## Purpose
Cumulative hardening release on top of 16.113.0. It does not introduce a new identity, tenant, mission, accounting or market authority.

## Implemented in source
- Tenant-scoped Qarz aging API with 0–30, 31–60, 61–90 and 90+ day buckets; age is calculated from the recorded transaction date and due dates are not fabricated.
- Append-only Qarz case workflow: open, acknowledge, dispute, resolve or reject; immutable event history and audit events. Cases are internal organization records, not counterparty signatures.
- Owner/admin-controlled monthly accounting-period locks. New entries whose recorded month is locked fail closed. Lock records are immutable; this release intentionally does not provide period reopening.
- Owner/admin journal adjustments for opening balances and refunds, with idempotent client transaction IDs, balanced debit/credit pairs, immutable journal storage and audit. Opening balance accounts are restricted to cash, inventory, receivables and payables. Refunds are journal-only financial adjustments; they do not silently alter inventory or original source entries.
- Signed runtime receipt endpoint for the Germany Logistics isolated-staging harness. It verifies an HMAC signature, current release identity, non-production HTTPS target, canonical journey completeness, passing checks, scenario/capability/market scope, and immutable runtime-verified simulation evidence.
- CI runner `npm run certify:staging-simulation` invokes the existing deployed mission runtime harness against an explicitly labeled isolated staging environment, then submits a signed receipt.
- Migration 0174 and schema snapshot regenerated.

## Still not complete / requires further design or external action
- Tax handling is not implemented as tax advice or statutory tax accounting. Country-specific tax rules, tax account mappings, invoice requirements and professional review are required before adding automated tax calculation.
- Full sale-return inventory reversal and linked refund workflow still requires an explicit source-entry reversal contract and stock reconciliation.
- Qarz due-date reminders, external counterparty acknowledgement, payment-provider confirmation and dispute adjudication are not implemented.
- Live backup restore/import remains disabled. A safe restore needs staged file evidence, collision policy, full dependency mapping, dry-run, owner step-up, idempotency, atomicity strategy, rollback and restore certification.
- Simulation Lab remains model-only for scenarios; no production service is run in an isolated runtime by the Lab. Existing deployed runtime certification harness can execute the canonical mission journey when credentials and explicit disposable test mission authorization are supplied.
- Afghanistan legal, native-speaker, metrology and merchant acceptance reviews remain human obligations. No approval or activation is asserted.
- Public market indicators remain gated on real opt-in cohorts, current quality runs and approved publication contracts.
- Germany Logistics requires deployed runtime regression and full canonical journey execution with authorized test accounts.

## Verification
Source-level tests and cumulative architecture/release checks must pass before deployment. Production build requires Node 24.x as specified by `.node-version`. This candidate is not deployed and is not production certified.
