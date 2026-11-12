# Mission Execution 16.113.0 — Unified Control Plane, Digital Daftar and Public Market Data

Status: hardening candidate

## Release objective

16.108–16.113 are a cumulative implementation series on the existing ON Mission platform. They do not introduce a second backend, identity provider, tenant authority, mission lifecycle or Super Admin application. They add capability governance, a shared Simulation Lab market catalogue, an append-only Daftar business journal, PWA/data portability, controlled Afghanistan pilot gates, and a governed public market-data API.

The release preserves the platform priority order: Security → Truth → Liveness → Stability → Experience → Scale.

## Delivered in source

### 16.108 — Unified Control Plane and Capability Governance
- Added canonical capability definitions, market/sector bindings and append-only lifecycle events.
- Added lifecycle states: defined, configured, simulated, certified, published, activated, monitored, suspended and retired.
- Added the Super Admin **Capabilities & Data** workspace, with capability contract inspection, market binding, lifecycle evidence, suspend/retire controls, market profile controls, pilot reviews, pilot tenant allowlist, public-data publication controls, scenario catalogue and one recommended next action for Markets, Capabilities & Data and Simulation Lab.
- Lifecycle transitions use Super Admin step-up and the existing country product launch / Market Factory authorities. Daftar activation also requires an active Daftar market profile.
- Capability certification requires an active critical/compliance evidence file. Publication requires a release reference and confirmation.

### 16.109 — Shared Simulation Lab integration
- Extended the existing `/simulator.html` experience with Afghanistan Daftar scenarios and Germany Logistics regression scenarios for normal execution, provider unavailable, route blocked, mission recovery, device disconnect, proof required, late delivery and cancellation.
- Added scenarios for shop-day stock/book reconciliation, Qarz partial settlement with separate receivable/payable treatment, offline idempotent replay, consent withdrawal, minimum-cohort suppression, tenant isolation and inactive-market write blocking.
- Added a guarded model-only evidence link from a saved platform simulation run to a market capability. It verifies scenario/capability/market/sector scope, records `client_model_unverified`, and does not advance lifecycle or certify a release.
- Simulation runs are isolated deterministic synthetic models. They do **not** execute production service code, contact real providers, mutate production D1, publish data or prove physical-world outcomes. Runtime-backed isolated execution remains a certification item; capability lifecycle promotion to SIMULATED is blocked until a server-side runtime verification receipt exists. Capability definitions and market bindings are source-seeded; the Super Admin UI governs lifecycle but does not yet author new contract versions.

### 16.110 — Digital Daftar Business Book
- Added an append-only, single-currency debit/credit journal linked to private Daftar entries.
- Sales, purchases, expenses, service, wage, freight and Qarz settlement entries create balanced journal pairs in the same D1 batch as their source entry and sync receipt.
- Non-cash and unverified settlement methods post to a clearing account and remain `merchant_reported`; the client cannot assert provider verification.
- Added account balances, currency reconciliation, separate Qarz receivable/payable balances, 30-day daily summaries and merchant-printable transaction receipts in the Daftar workspace.
- Receipt print views explicitly state that they are merchant records, not independent payment confirmation, statutory invoices or proof of delivery.
- This is an operational business book, not statutory accounting or tax-compliance certification. Opening-balance import, refund/return accounting, tax invoices, period locks and external accounting integration remain future work. Qarz aging, due dates, reminders, disputes and counterparty acknowledgment also remain future work.

### 16.111 — Daftar PWA and user data portability
- Added an installable web app manifest, PNG app icons, app-shell caching and an install prompt where supported.
- Added offline queue visibility, retry status, rejected-entry handling and explicit local removal after confirmation. Existing encrypted IndexedDB and identity-scoped sync remain in use.
- Added owner/admin-only CSV and JSON exports, a print-to-PDF statement, and an AES-256-GCM/PBKDF2 encrypted ZIP backup containing a manifest and structured records.
- Added a restore validation preview that checks market/organization scope, schema, record count, journal integrity, unique client entry IDs and inventory movement shape.
- Restore preview is **non-mutating**. Automated live import/restore is intentionally not enabled until reconciliation, conflict handling and rollback are certified. Evidence file bytes are not bundled; file references and hashes remain in the existing file authority. PDF output and transaction receipts use browser print-to-PDF, not a server-generated signed PDF.

### 16.112 — Afghanistan controlled pilot
- Added append-only legal, operational, merchant-acceptance, security, data-residency and metrology review records.
- Accepted reviews require an active critical/compliance evidence file and reviewer confirmation.
- Afghanistan Daftar profiles in `pilot` state require explicit organization/sector allowlisting. Access grants and revocations are recorded in an append-only event history.
- Moving a Daftar profile to `active` requires the latest accepted legal, operational, merchant-acceptance, security and data-residency reviews, plus the existing country product launch.
- Approval of local measurement conversions requires accepted metrology evidence. Unverified Seer/Man conversions remain proposed.
- Added initial Dari (`prs-AF`) and Pashto (`ps-AF`) RTL translation coverage for core navigation and form labels. This is beta localization, not complete native-speaker, legal or market-reviewed translation.
- Real merchant acceptance, local legal review, metrology verification and Afghanistan launch approval must be supplied by authorized humans; the software does not fabricate them.

### 16.113 — Public Market Data governance and API
- Added publication contracts, append-only quality-run history and public API access logging.
- Added quality visibility in Super Admin: input events, qualified indices, qualified contributor count, suppressed groups, freshness and API usage.
- Added a versioned public endpoint: `/api/public/market-data/v1/{countryCode}/{sectorCode}`.
- Merchant price indicators require explicit telemetry consent, active market/profile, minimum independent contributor cohort, outlier filtering and a fresh passing quality run.
- Added public approved-FX reference data from existing approved quote records; FX references do not require a merchant telemetry cohort, but still require market/profile activation and an approved publication.
- Public output contains aggregate values and provenance only; it does not return tenant, counterparty or contributor identifiers. Public endpoint rate limiting is 60 requests/minute/IP. Access logs are purged after 90 days.
- No public publication is auto-approved or auto-published. No public dataset is promised until it passes the publication gates.

## Database changes

Six ordered migrations were added:
- `0168_unified_capability_governance.sql`
- `0169_market_simulation_catalogue.sql`
- `0170_daftar_double_entry_business_book.sql`
- `0171_daftar_portability_and_install.sql`
- `0172_afghanistan_pilot_acceptance.sql`
- `0173_public_data_provenance_and_api_governance.sql`

The current schema snapshot was regenerated from all 173 ordered migrations. Data classification, retention and company-erasure dependency policies were extended. Tenant-erasure revokes controlled-pilot access while retaining append-only journal and audit history under the configured review policy.

## Verification completed in the authoring environment

- `npm run check:migrations` — PASS (173 ordered migrations; high-water mark 0173).
- `npm run check:release` — PASS (new 16.108–16.113 tests plus cumulative regression suite; 437 JS files, 1,653 local imports, zero import cycles, one canonical mission lifecycle writer).
- `node scripts/generate-schema-current.mjs` — PASS (schema regenerated from the migration chain).
- `node scripts/generate-runtime-release.mjs` — PASS (runtime release identity 16.113.0).
- `node scripts/check-schema-current.mjs` — PASS (284 tables, 495 indexes, 98 triggers).
- `npm run check:data-integrity` — PASS.
- `npm run check:health` — PASS (with existing note that production D1 migration 0036 must be confirmed applied before relying on its indexes).
- `npm run check:super-admin-build`, `npm run check:super-admin-decomposition` and `npm run check:release-engineering` — PASS.
- `npm run check:production-certification` — BLOCKED because runtime URL, certification account and adversarial account environment credentials were not supplied.

## Not yet certified or completed

- No production deployment, Cloudflare D1 migration application or live browser test is claimed.
- `npm run build` was attempted and stopped at the build-environment gate: authoring runtime Node 22.16.0 does not match `.node-version` / `engines.node` 24.22.1 / 24.x. Run the production build in the supported Node 24.22.1 environment.
- No live Germany or Afghanistan tenant acceptance, legal review, data-residency proof, backup/restore drill or protected-baseline promotion has occurred in this release task.
- Afghanistan country product launch remains governed by the existing Market Factory. Controlled pilot access remains closed until that authority is active and tenant allowlists/reviews are supplied.
- Dari/Pashto localization is partial beta coverage. Professional language and legal review is required.
- Simulation scenarios are deterministic synthetic models, not execution of production service code. A dedicated isolated runtime adapter is still required for full simulation certification. The `MONITORED` capability state currently requires human-attested active health evidence; continuous health-feed integration remains open. Capability definition authoring/version management is also not yet available in the UI.
- Restore supports validation preview only, not live import. PWA installation is browser-based; no native APK/desktop installer is supplied.
- The business book is not a statutory accounting package. Accounting, tax and local legal requirements require country-specific professional review.
- Public price data remains unavailable until enough verified/eligible opt-in contributors produce a fresh qualifying cohort. FX references are only the approved quotes present in the existing platform authority.

## Deployment boundary

Apply migrations 0168–0173 to a backed-up staging D1 database first, deploy to staging with Node 24.22.1, configure `DAFTAR_TELEMETRY_HMAC_SECRET` as a Cloudflare secret (32+ characters; never commit it), and complete the staging acceptance checklist in `DEPLOYMENT-16.113.md`. Promote only after live verification and explicit release approval.
# Mission Execution 16.107.0 — Country-aware Homepage, Afghanistan Market Experience & Public Data

Status: hardening candidate

## Release objective

The 16.107.0 increment adds a country-aware public homepage to the cumulative 16.106.0 Digital Daftar foundation. The homepage explains mission execution and data infrastructure, discovers country markets from the existing availability authority, presents Germany Logistics current state and Afghanistan Daftar capability/activation status, and provides a free public aggregate-data view with cohort and freshness protections.


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

- Version: `16.107.0`
- D1 migration high-water: `0167`
- Node requirement: `24.22.1`
- No new backend/auth/admin plane; existing ON Mission authorities reused.

## Preserved cumulative release history

The 16.107.0 source retains the prior governed market-launch work and includes the 16.106.0 Daftar foundation plus the public homepage increment. Historical baseline: **16.100.0 — Market Launch Workbench Runtime Repair**. Search misses are explicitly labeled; the workbench selects a canonical next action, keeps external dependencies visible, and does not turn task completion into launch certification.

The 16.105.0 source introduced the Germany launch-control and proof-gate candidate. At that point, **No database migration** was added; the release did not certify production deployment, legal approval, provider connectivity, residency, backup restoration or physical mission evidence. Its preparation automation did not publish, verify, activate or open public onboarding. Those statements describe the historical 16.105.0 boundary; 16.106.0 adds migration 0167 for Digital Daftar and does not claim the external proofs are complete.

The historical 16.105.0 candidate **does not certify** a production market, and its physical mission evidence remained an external launch gate. The 16.106.0 Daftar module, retained in 16.107.0, likewise does not certify product authenticity, payment settlement, accredited laboratory status or legal compliance from self-reported data.

The historical preparation path **does not publish, verify, activate or open public onboarding**; these remain separate authorized market-release transitions.

## Cumulative platform release-engineering context

This additive release preserves the platform's **Global Compliance Context**, **Private ForYou** workspace semantics, **Consent & Privacy** controls and **Data Subject Rights** workflow. The deterministic build and migration contract remain canonical. `database/schema.current.sql` is generated from the ordered migration history and now includes active database triggers. New code must remain inside the canonical domain boundary, use the canonical capability model and preserve canonical vocabulary. Capability gates remain server-enforced. The Germany Logistics pilot and its existing Cargo terminology/compatibility contracts are preserved; Daftar adds a distinct Afghanistan-first trade/field-record capability rather than changing the Germany logistics mission authority.

## 16.107.0 public experience increment

- Reworked the canonical `/` homepage around mission execution, data infrastructure, markets, platform capabilities, current situation and public market data.
- Added a country-aware market discovery projection to the existing `/api/product/availability` endpoint. Germany state remains sourced from Market Factory and country product launch truth; Afghanistan state is sourced from existing Daftar market profiles and the canonical country product launch authority.
- Added read-only `/api/public/market-data` for cohort-protected, fresh aggregate price indices only. It requires an active country product, a pilot/active telemetry-enabled Daftar profile, at least the configured contributor cohort (never below five), and a snapshot no older than 20 minutes. It never returns private ledger fields or individual telemetry events.
- Afghanistan remains a controlled pilot until the canonical Country Product Launch is activated. This release does not activate the market or bypass tenant eligibility.
- Release status remains a hardening candidate; no production build, deployment or live browser acceptance is claimed.
