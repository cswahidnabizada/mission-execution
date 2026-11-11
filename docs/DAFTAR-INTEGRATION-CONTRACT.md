# Digital Daftar — External Integration Contract v1

## Integration principle

An external ERP, TMS, WMS, wallet, buyer, supplier or government platform must not become a second ON Mission mission authority. It may submit business records or verified provider facts through a dedicated adapter. ON Mission retains tenant identity, country/sector policy, authorization, canonical mission state, assignment, execution, outcome verification and audit.

## v1 endpoints

### Tenant-authenticated

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/daftar/bootstrap` | Market, sector template, privacy state and dashboard projection |
| GET | `/api/v1/daftar/ledger` | Tenant-private entries |
| POST | `/api/v1/daftar/sync` | Offline batch ingestion (max 25 entries / 128 KiB) |
| POST | `/api/v1/daftar/consent` | Owner/admin telemetry opt-in or withdrawal |
| GET | `/api/v1/daftar/market/prices` | Current cohort-protected country/sector feed |
| GET | `/api/v1/daftar/fx/quote?base=AFN&quote=USD` | Current approved FX reference quote |
| POST | `/api/v1/daftar/fx/convert-preview` | Preview only; no ledger mutation |
| GET/POST | `/api/v1/daftar/passports` | List/create tenant batch passports |
| POST | `/api/v1/daftar/passports/:passportId/events` | Append a passport event |
| POST | `/api/v1/daftar/passports/:passportId/transfers` | Create a 30-minute custody challenge |
| POST | `/api/v1/daftar/transfers/:transferId/confirm` | Receiver confirms custody with authenticated tenant session |

### Public, token-protected

`GET /api/v1/daftar/verify/:token` returns a minimized public passport projection only when the passport was explicitly created with `visibility=public` and the supplied token matches its stored SHA-256 hash.

### Existing Super Admin security boundary

- `GET /api/platform/admin/daftar/markets`
- `POST /api/platform/admin/daftar/markets`
- `PATCH /api/platform/admin/daftar/markets/:profileId`
- `GET /api/platform/admin/daftar/unit-conversions?country=AF`
- `POST /api/platform/admin/daftar/unit-conversions/:conversionId/approve`
- `GET /api/platform/admin/daftar/fx-quotes?country=AF`
- `POST /api/platform/admin/daftar/fx-quotes`
- `POST /api/platform/admin/daftar/fx-quotes/:quoteId/approve`

Mutating platform controls require existing platform Super Admin step-up and write an admin audit event. No new admin login or role system exists.

## Offline sync payload

```json
{
  "events": [
    {
      "clientEntryId": "client-generated-unique-id",
      "idempotencyKey": "client-generated-unique-key",
      "entryType": "sale",
      "direction": "give",
      "itemCode": "cumin",
      "quantity": 2,
      "unitCode": "kg",
      "amount": 400,
      "currencyCode": "AFN",
      "paymentMethod": "cash",
      "cityCode": "HERAT",
      "counterpartyLabel": "Optional private label",
      "recordedAt": "2026-11-11T12:00:00.000Z"
    }
  ]
}
```

`tenantId`, `countryCode` and `sectorCode` are deliberately absent. They are derived from the authenticated ON Mission session and canonical organization profile. A duplicate idempotency key or client entry ID replays the prior receipt and does not reapply stock movements.

`amount` is a major-currency decimal at the API boundary; the service stores integer minor units. Quantities are converted to integer thousandths of the entered unit. If a regional unit mapping is not approved, the original quantity is still recorded privately, but inventory normalization and telemetry contribution are withheld.

## Integration adapter requirements

An external system integration should map its own records to this contract through a server-side ON Mission provider adapter:

- Stable `externalSystem`, `externalTenantId` and `externalRecordId` mapping.
- Stable idempotency key for each source record.
- Correlation ID propagated across requests, events and audit entries.
- Signed provider webhook validation for provider-verified payment or custody evidence.
- Retry with exponential backoff and duplicate-safe delivery.
- Explicit schema version and contract compatibility checks.
- No direct D1 access and no direct writes to canonical mission tables.
- No claim of payment verification from a client-supplied wallet/Hawala reference.

The current tenant routes use the existing ON Mission authenticated session. They are not a public server-to-server API. A service-to-service integration must be built through the existing connection/provider governance before an external system is allowed to call them.

## Suggested external event mapping

| External source fact | Daftar/ON Mission treatment |
|---|---|
| ERP sales invoice | Private `sale` entry; retain external ID in adapter correlation metadata, not as tenant authority |
| Purchase invoice | Private `purchase` entry and stock `get` movement |
| Warehouse dispatch | Private `sale`/`freight` entry and stock `give` movement |
| TMS waybill | `freight` entry with origin, destination and waybill reference |
| Payroll wage record | `wage` entry; provider verification only after signed source verification |
| Wallet settlement webhook | A verified provider event only after signature, merchant account and transaction status are checked server-side |
| FX provider rate | Proposed quote; Super Admin approves after source review |
| Supplier/batch certificate | Existing R2 mission file reference with SHA-256; accreditation is separately verified |
| Delivery/custody scan | Two-party authenticated custody challenge; do not trust a sender-only scan |

## Trust and proof vocabulary

- `merchant_reported`: self-reported ledger or price fact.
- `mission_linked`: a tenant-accessible canonical mission reference was resolved.
- `file_hash_linked`: an active same-tenant file record with SHA-256 was attached.
- `counterparty_acknowledged`: receiving tenant authenticated and accepted a custody challenge.
- `system_rule_checked`: the event passed the Daftar mass-balance invariant.

None of these labels alone proves physical truth or legal compliance. `provider_verified` is reserved for a future server-side trusted integration and is not accepted from browsers or external payloads in v1.
