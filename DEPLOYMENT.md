> Current cumulative source: **16.107.0**. Follow `DEPLOYMENT-16.107.md` for the country-aware homepage and public-data release checks. This document retains the 16.106.0 Daftar-specific deployment details.

# ON Mission 16.106.0 — Deployment

## Requirements

- Node.js 24.18.0 (`.node-version`)
- npm 10.x or 11.x
- Existing Cloudflare Worker `onmissionok-repo`
- Existing D1 `onmission-db`, KV, R2, AI and Vectorize bindings

## Before production deployment

1. Confirm the live D1 migration ledger is at the expected prior high-water mark and inspect pending migration `0167_embedded_trade_ledger_daftar.sql`.
2. Confirm Afghanistan exists in the country catalog and that the existing Afghanistan `country_product_launches` record is active before testing tenant access. The Daftar migration only provisions sector profiles in `pilot`; it does not activate the country product market.
3. Configure the telemetry pseudonymization secret separately in production and preview. Generate a high-entropy secret and set it with the Cloudflare secret command. Never place the value in `wrangler.jsonc`, source control, ZIPs or browser code:

   ```bash
   openssl rand -hex 32
   npx wrangler secret put DAFTAR_TELEMETRY_HMAC_SECRET
   ```

   Keep the secret stable. Rotation requires a planned contributor-key migration or deletion/rebuild of the retained 90-day telemetry window. If it is not configured, private ledger records still work but market telemetry contributions are skipped.
4. Confirm the Worker has the existing `DB`, `KV_BINDING`, `FILES` and static asset bindings. Daftar does not create parallel storage.
5. Review Afghanistan-specific privacy notice, consent language, local metrology references, FX source approval, DPP evidence policy and financial-services boundaries with qualified local counsel/market owners.

## Canonical Cloudflare deployment path

The configured production release command is `npm run deploy:production`. The existing production Worker name remains `onmissionok-repo`; do not create a parallel Worker or bypass repository release gates with a bare `wrangler deploy`. The command runs the build, release and health checks, migration checks, production certification, applies pending migrations and then deploys the Worker. Keep the GitHub-to-Cloudflare main-branch integration as the single production path; verify repository, branch, project root and Cloudflare environment in the account before deployment.

Do not reset or recreate production D1. Confirm the live applied migration high-water mark before the migration step. Never commit provider credentials or `.dev.vars`; use Cloudflare secrets/bindings.

## Release checks

```bash
npm ci
npm run build
npm run check:release
npm run check:health
npm run check:migrations
npm run check:super-admin-build
npm run check:super-admin-decomposition
npm run check:release-engineering
npm run check:duplicate-files
node scripts/check-release-integrity.mjs
```

This release adds D1 migration `0167_embedded_trade_ledger_daftar.sql`. The canonical schema snapshot now includes triggers as well as tables, views and indexes because the inventory, credit and custody invariants depend on database triggers. Inspect the live migration ledger and backup before applying.

## Post-deploy acceptance

1. Confirm the Worker deployed and the D1 migration ledger includes `0167`.
2. Sign in through the existing ON Mission account system as an Afghanistan organization administrator. Do not create a separate Daftar account.
3. Confirm the existing Afghanistan product market is active, the organization country/sector profile is correct, and its Daftar market profile is `pilot` or `active`.
4. Open the existing workspace navigation item **Daftar** (`#daftar`). Confirm bootstrap, sector template and privacy state load.
5. Test a purchase (`get`) to create opening stock, then a sale (`give`). Confirm the balance changes once. Replay the same client entry/idempotency key and confirm stock does not change twice. Attempt to oversell and confirm the ledger write is rejected atomically.
6. Test Qarz creation and partial/full settlements; confirm over-settlement is rejected.
7. Test offline capture after loading the app online: switch the device offline, create records, reconnect and confirm idempotent sync. Test with real low-bandwidth/2G conditions.
8. Confirm telemetry is off by default. Opt in with an owner/admin account, create test contributions from at least five distinct test tenants, wait for the 15-minute scheduled aggregation, and confirm the KV feed only contains cohort-qualified data. Withdraw consent and confirm the sector feed is invalidated and rebuilt without that contributor.
9. Confirm unapproved Seer/Man conversions do not affect inventory or passport normalization. Approve a local mapping only after a verified metrology source is reviewed and audited.
10. Confirm FX conversion preview uses an approved, current quote and does not change ledger entries. Confirm wallet/Hawala entries remain reported, not provider-verified.
11. Create a private passport, then a deliberately public test passport. Verify the public projection contains no tenant/counterparty/file IDs/private notes. Test mass-balance rejection and a two-tenant custody challenge.
12. Test tenant isolation with two real test tenants and role separation. Verify privacy export includes only the requesting tenant's Daftar data.
13. Verify existing R2 evidence file hash references and mission links; do not claim lab accreditation from file attachment alone.
14. Run backup/restore, Germany/Afghanistan cross-border data-flow, monitoring and incident-response checks before real market use.

## Deployment truth and remaining launch gates

Source/runtime tests do not prove a successful Cloudflare build/deploy or live authenticated acceptance. This release does not provide wallet provider verification, money movement, remittance execution, accredited-lab validation, QR image/camera scanning, a public/paid B2B price API, or complete Dari/Pashto localization. It does not certify Afghanistan legal compliance, EU DPP compliance, physical product authenticity, data residency or backup restoration. Do not use a market readiness percentage as a substitute for those external proofs.
