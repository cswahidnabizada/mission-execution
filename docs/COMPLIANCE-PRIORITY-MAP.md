# ON Mission — Persistent Compliance & Universalization Priority Map

This is a release-governance artifact. Review it after every release. An item is complete only when the implementation, tests, and release evidence prove it.

## P0 — must resolve before claiming mature compliance architecture

1. Canonical data classification — APPLIED 10.33.0; preserved and consumed by governance
2. Purpose + legal-basis model — APPLIED 10.33.0; compliance context now exposes the catalog definition
3. Retention policy architecture — APPLIED 10.33.0; privacy lifecycle now consumes policy
4. Deletion vs historical Truth reconciliation — APPLIED 10.35.0
5. Location governance — APPLIED 10.33.0
6. Critical audit failure semantics — APPLIED 10.35.0
7. Jurisdiction expansion beyond country — APPLIED 10.33.0
8. Data residency architecture — APPLIED AS POLICY BOUNDARY; BLOCKED for physical German data-plane enforcement until infrastructure is provisioned
9. Sector policy architecture — APPLIED 10.33.0
10. Policy capability bug in User Situation — APPLIED 10.33.0

## P1 — required for Germany/global maturity

11. Consent architecture — FOUNDATION APPLIED; workflow enforcement remains
12. Data-subject-rights workflow architecture — APPLIED FOUNDATION 10.35.0; full rights workflows remain
13. File/evidence governance — REMAINS
14. External-provider data governance — FOUNDATION APPLIED; provider registry enforcement remains
15. Notification data governance — APPLIED 10.35.5; provider-specific enforcement remains
16. Analytics governance — REMAINS
17. Backup/recovery governance — REMAINS
18. Compliance configuration/evidence surface — FOUNDATION APPLIED; operator surface remains

## P2 — universalization cleanup

19. Move logistics vocabulary toward capabilities — FOUNDATION STARTED
20. Generalize customer/object/resource relationships — REMAINS
21. Remove proven compatibility wrappers — REMAINS; perform reference audit first
22. Reduce duplicate legacy terminology — REMAINS
23. Continue frontend/domain vocabulary separation — FOUNDATION STARTED

## 10.35.0 review

10.35.0 completes P0 items 4 and 6. P0 item 8 is BLOCKED only for physical German infrastructure provisioning; the policy boundary is implemented. P1/P2 remain explicitly tracked below.

## Release loop

```text
AUDIT
→ DESIGN
→ IMPLEMENT
→ TEST
→ SECURITY REVIEW
→ PRIVACY REVIEW
→ ARCHITECTURE REVIEW
→ REGRESSION
→ BUILD
→ CLEAN PACKAGE
→ DEPLOY
→ REAL USER TEST
→ PROTECT
→ EXPAND
```

For each release, update every numbered item with one of:

- APPLIED — implementation and tests prove the item
- REMAINS — not complete; state the next concrete step
- BLOCKED — identify the external dependency or required legal review

Never mark an item complete solely because a policy/document exists.


## 10.35.0 File & Evidence Governance

File classification, purpose, controller/owner relationships, access policy, retention, legal hold, evidence integrity and policy-aware disposition are now implemented through the canonical file governance service. D1 remains the current canonical database; R2 remains the binary object store. German PostgreSQL remains a future physical residency migration.

Historical protected release: 10.34.0 established Privacy + Historical Truth + Critical Audit. Current release: 10.35.0 extends that foundation to File & Evidence Governance.
