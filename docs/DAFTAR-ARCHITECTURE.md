# ON Mission Embedded Trade Ledger & Market Telemetry — 16.106.0

## Product definition

Digital Daftar is an embedded, country- and sector-governed capability inside the existing ON Mission multi-tenant application. It is not a separate product backend, identity provider, tenant registry, or administration panel.

It combines four related but deliberately separated capabilities:

1. **Private Give & Get ledger** — voluntary records of trade, services, wages, freight, stock movements, Qarz and two-currency exchange references.
2. **Opt-in market telemetry** — minimized, pseudonymous price/activity observations used to produce cohort-protected market indices.
3. **Batch Product Passport** — a tenant-controlled batch record with mission/file references, mass-balance checks and authenticated custody handoffs.
4. **Market configuration** — versioned JSON sector templates and country/sector enablement governed by the existing ON Mission Control Plane.

The intended first market is Afghanistan (`AF`). The same template/runtime can later be enabled for another country by creating and approving its country/sector market profile after that country's product market is active.

## Existing platform authorities reused

| Concern | Existing ON Mission authority |
|---|---|
| Sign-up, login, sessions | Existing authentication and account lifecycle |
| Tenant boundary | Existing `companies` / authenticated `session.tenantId` |
| Country and sector | Existing `company_management_profiles.country_code` and `sector_code` |
| Country availability | Existing active `country_product_launches` |
| Role checks | Existing organization-role middleware |
| Security limits | Existing action rate limiter |
| Audit | Existing security audit service and admin audit service |
| Mission references | Existing canonical mission lookup (`getForSession`) |
| File evidence | Existing `mission_files` / R2 upload and SHA-256 metadata |
| Privacy rights/export | Existing privacy service, extended for Daftar records |
| Runtime and infrastructure | Existing Cloudflare Worker, D1, KV, R2 and scheduled handler |

The module resolves tenant, country and sector from the authenticated server-side context. It never trusts a client-supplied tenant ID, country code or sector code to choose the data boundary.

## Runtime architecture

```text
Existing ON Mission account + tenant workspace
                 |
                 v
       #daftar mobile workspace
       - sector-template form
       - encrypted IndexedDB queue
       - cached app shell
                 |
       POST /api/v1/daftar/sync
                 |
                 v
       Existing Cloudflare Worker
       - existing session + organization role
       - country/sector market gate
       - rate limit + validation
       - idempotency receipt
                 |
        +--------+-------------------------------+
        |                                        |
        v                                        v
 D1 private ledger                       D1 opt-in telemetry
 entries / Qarz / stock                  minimized facts only
 movements / passports                   HMAC contributor key
 custody / evidence                      90-day expiry
        |                                        |
        v                                        v
 D1 trigger-maintained                    15-minute scheduled
 inventory projection                     weighted median + outlier
        |                                        |
        |                                        v
        |                                  D1 market indices
        |                                        |
        |                                        v
        |                                  KV market feed
        |
        v
 Existing R2 mission files + mission references
        |
        v
 Batch Passport public verification (token hash)
```

D1 remains the source of truth. KV is a short-lived read projection only. AI/Vectorize are not given authority to create, modify or verify ledger facts.

## Country and sector activation

A tenant can open `#daftar` only when all of the following are true:

- The existing organization profile has an active company record and a country/sector profile.
- Its organization lifecycle state is one of `ACTIVE`, `ONBOARDING`, `PENDING_VERIFICATION` or `VERIFIED`; restricted, suspended and archived organizations are denied.
- The country exists and is active in the existing country catalog.
- The country's existing `country_product_launches` row is active.
- A matching `daftar_market_profiles` row is `pilot` or `active`.
- The profile's `template_version` exactly matches the deployed template version.
- The sector exists in the deployed template.

Migration 0167 provisions Afghanistan sector profiles in `pilot` state. It does **not** activate the Afghanistan country product launch. That remains the existing Market Launch authority's responsibility. The current AF free subscription policy is reused; Daftar does not create a new billing system.

For later countries, the existing Super Admin API can create a `draft` profile and, after the country product launch is active, move it to `pilot` or `active`. There is no parallel admin panel.

## Sector template contract

- Formal schema: `config/daftar/sector-template.schema.json`
- Afghanistan instance: `config/daftar/sector-templates.v1.json`
- Current template version: `1.0.0`

Sectors included:

| Sector | Supported record types | Sector behavior |
|---|---|---|
| `general` | sale, purchase, expense, credit settlement, service | general give/get ledger and stock where applicable |
| `trade` | sale, purchase, expense, credit settlement | shop/wholesale stock and Qarz |
| `retail` | sale, purchase, expense, credit settlement | retail stock and Qarz |
| `logistics` | freight, expense, wage | route codes, waybill/reference, weight and freight fee |
| `fx` | fx exchange | two-currency reference record only; no exchange execution |
| `labor` | wage, service, expense | work quantity/time and wage record |

The user interface renders the same entry engine with the sector's permitted entry types. Templates are code-versioned and the database profile pins a version; an unknown version fails closed.

## Private ledger and inventory

`daftar_private_entries` stores tenant-private records. It can include a counterparty display label, coarse city code, quantities, original currency, payment method, route codes, Qarz relation and two-currency FX reference. It does not collect phone numbers, national IDs, biometric signatures, exact GPS coordinates or live location photos in this release.

Amounts are stored in integer minor units (two decimal places for AFN/USD/EUR in this initial contract). Original amount and currency are preserved. A converted amount is only a preview based on an approved, dated FX quote; it does not rewrite the original entry.

Inventory is an append-only movement ledger. D1 triggers validate unit consistency and sufficient stock, then maintain `daftar_inventory_balances` atomically. A `give` movement reduces stock; a `get` movement increases stock. A sale that would make stock negative is rejected; opening stock must first be recorded as a `get` movement.

Qarz is represented by a credit entry and append-only settlements. D1 triggers enforce that settlement amounts cannot exceed the original credit balance and update the remaining balance.

Payment methods are `cash`, `hesabpay`, `afpay`, `hawala_record`, `credit` and `other`. Cash/wallet/Hawala status is reported by the merchant. Wallet and Hawala references are **not verified** in this release. `hawala_record` is record-keeping only, not remittance execution or money movement.

## Unit normalization

Canonical units include kg, g, tonne, piece, hour, day and liter. Conversion uses integer rational factors; no floating-point conversion is used for persisted normalized quantities.

`Seer` and `Man` are regional units. Prototype examples (Herat/Kabul Seer = 7 kg; Kandahar Man = 4.5 kg) are stored as **proposed** mappings only. They do not affect inventory, telemetry normalization or passport issuance until a platform Super Admin approves a verified local metrology source. The approval is audited. Do not treat the prototype values as national standards.

## Currency and FX references

- Supported currencies: AFN, USD, EUR.
- Every ledger record preserves the entered currency and amount.
- An FX record stores both currency legs and a merchant-reported source note; it does not perform an exchange.
- Approved reference quotes live in `daftar_fx_quotes`, with source, observed time and expiry.
- A platform Super Admin proposes and separately approves a quote after source review.
- Tenant conversion preview requires a currently approved quote and is explicitly preview-only.
- No payment provider, bank, wallet, Hawala or remittance integration is assumed.

## Offline sync and idempotency

`POST /api/v1/daftar/sync` accepts at most 25 entries per batch and a 128 KiB request body. Each entry must carry a client entry ID and idempotency key. Each entry is independently committed with its inventory movement, telemetry fact (when permitted) and sync receipt in a D1 batch. A repeated idempotency key or client entry ID returns the prior receipt instead of applying the movement twice.

The browser queue uses IndexedDB and AES-GCM with a non-extractable device key, and is namespaced by the server-issued tenant/identity scope. A minimal last-known template/scope is cached locally so the same account can reload the workspace offline after its first online load; this does not provide offline login or authorization. On reconnect, the Worker bootstrap is rechecked before any queued event is sent; if the account scope changed, the old queue is left isolated and is not sent under the new account. The app shell and Daftar assets are cached by a same-origin service worker. This is best-effort device-at-rest protection, not end-to-end encryption: a same-origin script compromise could access the queue. The device queue is capped at 1,000 pending entries. Sync occurs when connectivity returns. Rejected records remain queued and are shown for correction.

## Privacy-split market telemetry

Telemetry is not copied from the private ledger as a full record. The sync service creates a separate minimized event only when:

- The organization owner/admin has explicitly opted in.
- The country/sector profile allows telemetry.
- The sector supports the event kind.
- A compatible normalized quantity and item code are available.
- `DAFTAR_TELEMETRY_HMAC_SECRET` is configured.

The telemetry table contains no company ID, customer label, phone, private note, payment reference, GPS or passport token. It contains country, sector, optional coarse city code, item code, event kind, normalized unit/quantity, unit price, currency, a keyed pseudonymous contributor key, trust class/weight and expiry. The HMAC input is scoped to tenant + country + sector. The mapping key is retained only in the private consent table, not in the telemetry table. The key is pseudonymous and linkable within that market scope; it is **not anonymous data**.

All v1 merchant submissions are `merchant_reported` with server-assigned weight 350/1000. A browser cannot claim `provider_verified`. A future provider integration must verify a signed provider event server-side before that class/weight can be assigned.

Every 15 minutes the Worker rechecks current tenant verification and consent before selecting any sample, then aggregates the previous 24 hours. It calculates a weighted median, excludes observations outside ±20% of the median, then requires at least five distinct contributors **after** outlier filtering. If verification is revoked, the next aggregation deletes that tenant's pseudonymous raw contributions before rebuilding the feed. It writes aggregate indices to D1 and a one-hour KV feed. This is a privacy threshold, not proof that contributors are independent real-world businesses or that every submitted price is true.

Withdrawing consent immediately deletes the contributor's retained pseudonymous raw events, deletes that country/sector's current aggregate indices and invalidates its KV feed. The next scheduled aggregation rebuilds it from remaining contributions. Raw telemetry expires after 90 days.

The market feed in v1 is tenant-authenticated. A public/paid B2B market-data API, billing entitlement and external API-key system are not part of this release.

## Digital Product Passport (DPP)

`batch_passports` holds the batch identity, current custodian and a SHA-256 hash of a 256-bit public verification token. The raw token is returned once when a passport is created as public. The public route is:

`GET /api/v1/daftar/verify/:token`

The public projection excludes tenant names, counterparty details, file IDs, private notes, GPS and internal evidence hashes. It reports event type, date and server-assigned evidence class.

`batch_events` can link to an existing tenant-accessible canonical mission and an existing tenant-owned `mission_files` record. File-linked events require an active file record with a stored SHA-256 hash. A `lab_test` event additionally requires a PDF classified as `critical_evidence` or `compliance_evidence`. This proves only that a file record/hash is attached; it does not prove laboratory accreditation or the report's truth.

Evidence classes are assigned by the server:

- `merchant_attested`
- `mission_linked`
- `file_hash_linked`
- `counterparty_acknowledged`
- `system_rule_checked`

They are not interchangeable with independent verification. The mass-balance rule is `output + declared waste <= input + declared additions`, using the same normalized unit. A custody handoff requires a one-time 30-minute challenge token and an authenticated session for the receiving tenant. The receiver confirms; D1 guards ensure the passport still belongs to the sender at confirmation time.

The API returns a QR-compatible verification URL and a one-time custody challenge payload. This release does not render a QR image or provide a camera scanner; the payload can be encoded by a trusted QR tool. Public verification is a record lookup, not a legal certificate, product authenticity guarantee, EU DPP certification or proof of physical custody.

## Existing R2 and mission audit bridge

No new upload path is introduced. DPP events reference existing `mission_files` entries in R2 and store the file's existing `content_sha256`. The file must belong to the same tenant and remain active. Mission references are resolved through the existing canonical mission service. Daftar events are audited through ON Mission's existing security audit service; the mission itself remains owned by the canonical mission lifecycle.

## Retention and data rights

- Raw market telemetry: 90-day expiry.
- Private ledger and passport records: marked `review_due` after 1,095 days; not automatically erased. Legal hold and applicable business-record obligations require a governed review before deletion.
- Existing tenant privacy export now includes Daftar entries, inventory, Qarz settlements, passports, events and consent state for the tenant administrator. Account erasure withdraws telemetry and deletes its pseudonymous raw events, redacts private counterparty/route fields, makes owned passports private, closes custody held by the departing tenant and preserves the historical record for governed retention review.
- Telemetry withdrawal is available in the Daftar privacy control and deletes the retained contributor events and current aggregate projection.

The configured retention policy and current jurisdiction registry are inherited from ON Mission. Afghanistan-specific legal review, data-controller/processor roles, notice/consent language, retention requirements, cross-border transfer rules and financial-service restrictions must be approved before public launch. The source configuration is not a legal opinion or a residency certificate.

## Environment and operations

Required Cloudflare bindings already present in the repository:

- `DB` — ON Mission D1
- `KV_BINDING` — existing KV namespace
- `FILES` — existing R2 bucket
- `ASSETS` — existing static asset binding

Required secret for telemetry contributions:

- `DAFTAR_TELEMETRY_HMAC_SECRET` — at least 32 characters; configure separately for production and preview with Cloudflare secrets. Never commit it. Keep it stable; rotation requires a planned contributor-key migration or deletion/rebuild of the 90-day raw telemetry window.

Scheduled trigger added: `*/15 * * * *` for market telemetry aggregation. The existing daily 03:17 schedule continues to run the existing privacy/operational cleanup, including retention review marking.

## Current release boundaries / remaining work

This release establishes the backend foundation and a mobile-responsive workspace. It does not yet include:

- Actual Cloudflare Node 24 build/deploy and live tenant browser acceptance.
- A Super Admin visual workspace for Daftar market profiles, unit conversions and FX quotes (governed APIs are present and reuse existing Super Admin auth/step-up).
- Camera QR rendering/scanning; only QR-ready URLs/challenge payloads are exposed.
- Wallet provider webhooks or verified payment status.
- Accredited-lab registry and accreditation validation.
- Public/paid B2B market API and billing entitlement.
- Full Dari/Pashto localization and validated local terminology.
- A legal-reviewed Afghanistan notice/consent and DPP schema for a specific regulated product category.
- Real 2G/3G field tests, adversarial tenant tests on deployed infrastructure, backup/restore evidence and a supervised real supply-chain handoff.

These remain launch gates, not implied successes.
