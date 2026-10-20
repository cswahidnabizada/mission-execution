# Hardening patch (applied on top of 16.10.84)

Version label is unchanged (16.10.84); bump it through your normal release process.

1. Super-admin logout now revokes the session server-side (KV deny-list keyed by session nonce, TTL = remaining token life). Step-up tokens bound to that session die with it. Forged tokens cannot write to the deny-list. KV outage fails closed.
2. Failed super-admin logins are audited (`platform.super_admin.login_failed`, IP stored only as a truncated SHA-256 hash).
3. Login compares SHA-256 digests (no secret-length leak).
4. Migration 0162: `admin_control_audit_events` is append-only; `audit_logs` cannot be updated and rows younger than 30 days cannot be deleted (the retention purge still works).
5. Cookie reader no longer throws on malformed percent-encoding.
6. New test `tests/security/check-16-10-85-admin-session-and-audit-hardening.mjs` is the first step of `check:release`.
7. Per-release gates that whitelist migration high-water marks were extended to accept 0162; RELEASE-MANIFEST.json migration fields and schema hash updated.

Not changed (needs your decision): single shared secret + no MFA, optional `PLATFORM_SUPER_ADMIN_ALLOWED_IPS`, CSP `style-src 'unsafe-inline'`.
