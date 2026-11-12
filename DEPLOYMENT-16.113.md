# ON Mission 16.113.0 — Deployment and acceptance checklist

## 1. Pre-deployment

1. Use Node.js 24.22.1 and run `npm ci`.
2. Review the complete diff from protected 16.107.0 and confirm no unrelated files or authorities were replaced.
3. Back up the target D1 database and confirm R2 evidence/file backups are recoverable.
4. Inspect migrations 0168–0173 and confirm the production migration ledger is at 0167 before applying this release.
5. Configure `DAFTAR_TELEMETRY_HMAC_SECRET` as a Cloudflare Worker secret, at least 32 characters, stable across deploys. Never place it in GitHub source, `wrangler.jsonc`, JSON market packages or user-downloadable backups.
6. Verify `onmission-db`, `onmission-files`, KV, Vectorize and AI bindings remain unchanged and correctly mapped.

## 2. Staging deployment

1. Run `npm ci`.
2. Run `npm run check:migrations`, `npm run check:release`, `npm run check:health`, `npm run check:production-certification` and `npm run build`.
3. Apply migrations 0168–0173 to staging D1 using the existing migration runner.
4. Deploy the Worker and static assets to staging using the existing Cloudflare/GitHub pipeline.
5. Verify the migration ledger high-water mark is 0173 and `database/schema.current.sql` matches the applied schema.
6. Verify scheduled `*/15 * * * *` market aggregation and the existing daily cleanup run without errors.

## 3. Super Admin acceptance

- Open **Capabilities & Data**.
- Verify capability definitions and market bindings load from canonical D1 records.
- Verify one next action appears for Markets, Capabilities & Data and Simulation Lab.
- Verify capability transitions require Super Admin step-up and a valid reason.
- Verify simulation-to-capability linking refuses wrong scenario, capability, country or sector.
- Verify certification requires an active `critical_evidence` or `compliance_evidence` mission file and stores its content hash.
- Verify Germany Logistics activation is blocked unless the country product launch and the current Germany Market Factory package/version are LIVE and onboarding OPEN.
- Verify Daftar profile activation is blocked until the latest legal, operational, merchant-acceptance, security and data-residency reviews are accepted and backed by active evidence files.
- Verify an Afghanistan pilot profile allows only explicitly allowlisted organizations; revoke one and verify access is denied.

## 4. Simulation acceptance

Run each scenario from the shared `/simulator.html` workspace. Model runs are for preview and scenario discussion only; runtime-backed certification remains blocked until the server-side simulation adapter is delivered:

Afghanistan:
- `daftar-shop-day`
- `daftar-qarz-cycle`
- `daftar-offline-replay`
- `daftar-consent-withdrawal`
- `daftar-cohort-privacy`
- `daftar-tenant-isolation`
- `daftar-market-inactive`

Germany:
- `de-logistics-regression`

Confirm each run is marked simulation-only, has no production mutation or external provider command, and is saved immutably with `verification_status=client_model_unverified`. The model evidence link must not advance capability lifecycle. These deterministic models are not proof that production service code was executed; do not certify or activate a capability on their basis. Saved runs are explicitly marked client-model-unverified and can be linked as model-only evidence, but they do not advance capability lifecycle or certify a release.

## 5. Digital Daftar acceptance

- Verify sale, purchase, expense, service, wage, freight and Qarz settlement entries create balanced debit/credit journal pairs in the same atomic D1 batch as their source entry.
- Verify cash, credit and non-cash clearing account treatment is correct and all unverified payment evidence remains `merchant_reported`.
- Verify duplicate offline replay does not create a second entry or journal posting.
- Verify the Book summary reconciles each currency, receivables and payables are separated, and daily reports show the last 30 days.
- Print a transaction receipt and verify the disclaimer clearly identifies it as a merchant record, not independent payment confirmation or a statutory invoice.
- Install the PWA on supported desktop/mobile browsers. Confirm app shell loads offline only after an authenticated online session.
- Disconnect network, create entries, reconnect, sync and inspect pending/retry/rejected queue states. Change identity and verify the old queue cannot sync under the new identity.
- Download CSV, JSON, print/save PDF and encrypted ZIP. Verify SHA-256 header/audit records.
- Validate an encrypted ZIP backup with the correct password and verify the restore preview says `mutation: NONE`. Verify wrong password, wrong organization and wrong market are rejected.
- Do not treat restore preview as an import; no live restore path is enabled.

## 6. Afghanistan pilot activation

1. Complete the Afghanistan country product launch using the existing Market Factory; do not bypass it through Daftar admin.
2. Ensure country product status is active and the appropriate country/sector Market Package is approved.
3. Upload review evidence into the existing mission file authority as `critical_evidence` or `compliance_evidence` and confirm each file is active with a content hash.
4. Record accepted legal, operational, merchant-acceptance, security and data-residency reviews for each sector to be activated.
5. For local unit conversions, record an accepted metrology review with evidence; only then approve the conversion.
6. Keep profiles in `pilot` and explicitly allowlist the test tenant organizations first.
7. Run merchant acceptance with real participants and record the evidence. Do not claim this release performed the field test.
8. After review and pilot sign-off, move the profile to `active`; the existing country product launch remains a separate prerequisite.
9. Verify Dari/Pashto translations with native speakers and legal reviewers before public launch.

## 7. Public Data acceptance

- Keep publication contracts in `draft` until the country product launch and market profile are active.
- For merchant price data, verify opt-in consent, telemetry secret, minimum cohort of at least five distinct eligible contributors, outlier filtering and a fresh passing quality run.
- For FX references, verify quote status is approved and validity has not expired; the FX feed does not claim merchant cohort verification.
- Approve a publication with human evidence and step-up, then publish only after a fresh passing quality run.
- Verify the public API returns only approved indicators/reference data and no tenant, counterparty or contributor identifiers.
- Verify stale/blocked/undersized datasets return no public prices.
- Confirm API access logs are retained 90 days and scheduled cleanup runs.

## 8. Production release gates

Do not promote until all staging checks pass, the production build succeeds under Node 24.22.1, migration backups are verified, Germany regression tests pass, Afghanistan pilot/legal/data residency approvals exist, and a human release approver signs the evidence. Deploy through the existing pipeline, then run a live tenant acceptance test and protect the new baseline only after the actual production journey is verified.
