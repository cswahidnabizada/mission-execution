# Deployment — ON Mission 16.114.0

1. Use the pinned Node version from `.node-version` (24.22.1) and the repository lockfile.
2. Run `npm ci`, `npm run check:release`, `npm run check:health`, `npm run check:migrations`, `npm run check:schema`, `npm run check:release-engineering`, then `npm run build`.
3. Review migration `0174_daftar_book_controls_and_qarz_cases.sql` against the staging D1 database. Apply through the normal migration pipeline; do not manually skip earlier migrations.
4. Configure Cloudflare Worker secret `SIMULATION_RUNTIME_RECEIPT_SECRET` (minimum 32 characters) and the same secret in protected CI variables. Never put it in source control.
5. Deploy to staging. Verify Qarz aging is tenant-scoped; open and resolve a Qarz case; verify event history; lock a test month and confirm a new sync event for that month is rejected.
6. Verify opening-balance and refund adjustments appear in the journal and currency reconciliation remains balanced. Confirm refund is journal-only and does not imply stock reversal.
7. Run `npm run certify:staging-simulation` from protected CI with `ON_MISSION_RUNTIME_ENVIRONMENT=isolated_staging`, `ON_MISSION_RUNTIME_URL` set to a non-production HTTPS Worker, and the two distinct certification accounts. The runner explicitly creates and executes a disposable staging mission; do not point it at production.
8. Run production only after staging acceptance, migration backup, rollback review and release approval.

Never use real customer missions for destructive certification. The runtime harness can create and execute a real disposable mission only when the explicit environment flags are set.
