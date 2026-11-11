# 16.107.0 deployment sequence

1. Use the complete cumulative source ZIP and the existing GitHub → Cloudflare deployment workflow. Build with Node 24.x and the locked npm dependencies.
2. Run `npm run check:release`, `npm run check:health`, `npm run check:migrations`, `npm run check:schema`, `npm run check:release-engineering` and `npm run build` in the supported Node 24 environment.
3. Review the read-only `/api/product/availability` projection and the public `/api/public/market-data` SQL against the production D1 schema. The new homepage depends on migration 0167 from 16.106.0 having been applied.
4. Configure `DAFTAR_TELEMETRY_HMAC_SECRET` as a Cloudflare secret (32+ characters, stable, never committed) before enabling market telemetry.
5. Deploy the source candidate. Verify `/`, `/api/product/availability`, and `/api/public/market-data?countryCode=AF&sectorCode=trade` in a real browser.
6. Confirm Germany shows the exact Market Factory state and cannot bypass the live onboarding gate.
7. Confirm Afghanistan shows the pilot and activation gate. Do not enable tenant use until the existing Country Product Launch readiness, legal, residency, security, sector and operational gates pass and an authorized release is activated.
8. Test public data with no cohort, below-threshold cohort, threshold-satisfying cohort, stale index, withdrawn consent, disabled profile and inactive country launch. Only fresh aggregate rows with sufficient contributors should be returned.
9. Verify private ledger records, labels, notes, company IDs, contributor keys and individual telemetry events cannot be retrieved from the public route. Test authenticated Daftar tenant isolation separately.
10. Complete backup/restore, data-residency, mobile layout, keyboard/accessibility and live tenant acceptance. Record completed, remaining, blocked and untested items before protecting the baseline.
