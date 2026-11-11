# Mission Execution 16.106.0 — Embedded Trade Ledger & Digital Daftar

Status: hardening candidate

## Release objective

Add an embedded, country/sector-governed Give & Get ledger, privacy-split market telemetry pipeline and batch Digital Product Passport capability inside the existing ON Mission multi-tenant application. No separate backend, authentication system, tenant authority or admin panel is introduced.

## Delivered

### Tenant experience
- Added **Daftar** to the existing workspace navigation and renderer.
- Added a mobile-responsive Give & Get workspace with sector-aware entry types.
- Added quick amount calculator, payment tags, private counterparty label, logistics route/waybill fields, Qarz and stock views.
- Added encrypted IndexedDB offline queue, idempotent batch sync and cached app shell service worker.
- Added FX reference display and preview for approved AFN/USD/EUR quotes in the FX sector.
- Added batch passport creation/listing and custody challenge/receiver confirmation controls.

### Worker/API
- Added `GET /api/v1/daftar/bootstrap` and `/ledger`.
- Added `POST /api/v1/daftar/sync` with 25-entry batch cap, idempotency receipts and partial per-entry results.
- Added owner/admin telemetry consent and opt-out.
- Added tenant-authenticated market price feed and FX quote/preview routes.
- Added batch passport create/list, append-event, public verification and two-party custody transfer routes.
- Added Super Admin governed market profile, local unit conversion and FX quote proposal/approval routes using existing platform auth and step-up.
- Added a 15-minute market telemetry aggregation Cron.

### Data and governance
- Added D1 migration `0167_embedded_trade_ledger_daftar.sql`.
- Added private ledger, Qarz settlements, append-only inventory movements, stock projection triggers, sync receipts, market consent, pseudonymous telemetry, aggregate indices, regional unit conversions, FX quotes, passports, batch events and custody transfer tables.
- Added retention-review state for private business and passport records; operational cleanup marks records for review after 1,095 days instead of blindly deleting business evidence.
- Added Daftar data to tenant-admin privacy export.
- Updated current schema generator/snapshot to include database triggers as well as tables, views and indexes.

## Core safety rules
- Tenant, country and sector are resolved from existing authenticated ON Mission context, never trusted from client payloads.
- Country product launch and country/sector Daftar profile must both be active/pilot; Afghanistan is provisioned as pilot but not automatically launched.
- Telemetry is opt-in and pseudonymous, not anonymous. Customer names, notes, contacts and exact GPS do not enter telemetry.
- At least five distinct contributors must remain after outlier filtering before a price index is published.
- All v1 telemetry is merchant-reported (weight 350/1000). Browser claims cannot become provider-verified.
- Seer/Man conversions remain proposed until platform approval with a verified local metrology source.
- Original currencies are preserved; FX preview requires a sourced, approved and unexpired quote.
- Wallet/Hawala are record-only tags. No money is moved and no provider payment is claimed verified.
- Inventory and credit invariants are enforced by D1 triggers.
- Public passport verification is token-protected and minimized. Evidence classes distinguish merchant attestation, mission/file links, two-party acknowledgement and system rule checks.
- Mass balance enforces `output + waste <= input + declared additions`.
- Custody transfer requires a one-time challenge and authenticated receiver tenant.

## Tests

- `tests/system/check-16-106-daftar-runtime.mjs` — in-memory D1 runtime integration covering tenant context, offline idempotency, inventory, Qarz, FX, unit approval state, DPP, mass balance, custody, telemetry cohort/outlier and consent withdrawal.
- Existing release regression suite retained and run cumulatively.
- Migration/schema generation includes the new D1 tables and triggers.

## Not claimed complete
- Cloudflare Node 24 build/deployment and live browser acceptance.
- Real 2G/3G field validation and production tenant adversarial testing.
- Super Admin visual controls for the new governed APIs.
- Actual QR image generation/camera scanning.
- Wallet provider webhooks, payment verification, public/paid B2B market API or billing entitlement.
- Accredited laboratory registry and validation.
- Full Dari/Pashto localization and locally validated terminology.
- Afghanistan legal/privacy review, local metrology certification, cross-border residency evidence, backup/restore proof and supervised real supply-chain mission.

## Canonical release identity

- Version: `16.106.0`
- D1 migration high-water: `0167`
- Node requirement: `24.22.1`
- No new backend/auth/admin plane; existing ON Mission authorities reused.

## Preserved cumulative release history

The 16.106.0 source retains the prior governed market-launch work. Historical baseline: **16.100.0 — Market Launch Workbench Runtime Repair**. Search misses are explicitly labeled; the workbench selects a canonical next action, keeps external dependencies visible, and does not turn task completion into launch certification.

The 16.105.0 source introduced the Germany launch-control and proof-gate candidate. At that point, **No database migration** was added; the release did not certify production deployment, legal approval, provider connectivity, residency, backup restoration or physical mission evidence. Its preparation automation did not publish, verify, activate or open public onboarding. Those statements describe the historical 16.105.0 boundary; 16.106.0 adds migration 0167 for Digital Daftar and does not claim the external proofs are complete.

The historical 16.105.0 candidate **does not certify** a production market, and its physical mission evidence remained an external launch gate. The 16.106.0 Daftar module likewise does not certify product authenticity, payment settlement, accredited laboratory status or legal compliance from self-reported data.

The historical preparation path **does not publish, verify, activate or open public onboarding**; these remain separate authorized market-release transitions.

## Cumulative platform release-engineering context

This additive release preserves the platform's **Global Compliance Context**, **Private ForYou** workspace semantics, **Consent & Privacy** controls and **Data Subject Rights** workflow. The deterministic build and migration contract remain canonical. `database/schema.current.sql` is generated from the ordered migration history and now includes active database triggers. New code must remain inside the canonical domain boundary, use the canonical capability model and preserve canonical vocabulary. Capability gates remain server-enforced. The Germany Logistics pilot and its existing Cargo terminology/compatibility contracts are preserved; Daftar adds a distinct Afghanistan-first trade/field-record capability rather than changing the Germany logistics mission authority.
