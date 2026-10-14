# Germany Logistics Market — Launch Checklist

Baseline: package `ONM-DE-LOGISTICS-1`, version `1.0.0`; product `onmission-logistics`; country `DE`; sector `logistics`.

## Gate 1 — Package
- [ ] Import JSON or ZIP; retain source hash and version.
- [ ] Validate schema, duplicate keys, references and package bounds.
- [ ] Confirm selected package/version in Market Factory.

## Gate 2 — Legal and customer-facing content
- [ ] GDPR review evidence recorded by an appropriately qualified reviewer.
- [ ] BDSG applicability review evidence recorded.
- [ ] DDG applicability and provider-information review evidence recorded.
- [ ] Electronic communications/privacy applicability reviewed against actual cookies/tracking behavior.
- [ ] Replace `legal-notice`, `privacy-notice` and `terms` placeholders with reviewed, business-specific content.
- [ ] Record reviewer, date, evidence/source, rationale and reviewed package hash outside informal notes; link evidence to the release process.
- [ ] Review processor/subprocessor list, processing purposes, lawful bases, retention and data-subject rights.

## Gate 3 — Canonical reconciliation
- [ ] Run `PREVIEW CANONICAL CHANGES`.
- [ ] Verify Germany `DE` is reused or created exactly once.
- [ ] Verify sector `logistics` is reused or created exactly once.
- [ ] Review every policy/content/language/governance create, reuse, update or upsert operation.
- [ ] Resolve all policy/content scope conflicts.
- [ ] Confirm historical releases remain preserved.

## Gate 4 — Operational/security readiness
- [ ] Verify tenant isolation and authorization in runtime.
- [ ] Verify provider availability, actual data regions, backups and logging destinations.
- [ ] Verify residency and retention rules against real storage and subprocessors.
- [ ] Verify billing plan, EUR currency, tax configuration and invoice content with appropriate business/tax advice.
- [ ] Verify monitoring, incident response, restore and recovery procedures.

## Gate 5 — Mission certification
- [ ] Successful logistics mission from observation through verified outcome.
- [ ] Assignment rejection/authorization boundary tests.
- [ ] Failed effect and retry/idempotency tests.
- [ ] Evidence integrity and stale-state tests.
- [ ] Recovery and terminal/non-terminal liveness tests.
- [ ] Cross-tenant isolation tests.

## Gate 6 — Release
- [ ] Revalidate after any package or evidence change.
- [ ] Review exact release diff and dependency snapshot.
- [ ] Authorize/sign the exact immutable candidate.
- [ ] Confirm final preflight passes before publish.
- [ ] Publish and verify active release pointer and canonical record counts.
- [ ] Confirm market status `LIVE` and onboarding `INVITE_ONLY`.

## Gate 7 — Pilot and expansion
- [ ] Invite controlled pilot tenants only.
- [ ] Monitor mission completion, failures, recovery, support and security signals.
- [ ] Decide separately whether onboarding can move from `INVITE_ONLY` to `OPEN`.
- [ ] Export/re-import the release and test a second country reusing `logistics`.

A readiness score is not a substitute for evidence. Do not mark a legal, security or operational gate complete without supporting evidence. Do not manually delete canonical records to silence warnings.

## Workbench operating procedure (16.6.0)

Use the per-version **LAUNCH WORKBENCH** inside Market Factory as the task register. Each completion needs a meaningful summary and an evidence reference. Legal tasks additionally require reviewer and decision. A package edit is saved as a new immutable version; re-run validation after changes.

1. If the market is `RETIRED` and has no active release, inspect history and use `RESET TO DRAFT` only after confirming the retirement was not protecting a live release.
2. Open **EDIT PACKAGE AS A NEW IMMUTABLE VERSION**. Replace legal placeholders, finalize German/English content, and set legal/content statuses only after real review. Save as a new version.
3. On that new version, record evidence for market-status review, each required legal item, each content item, reconciliation preview, runtime certification, full mission-journey certification and publication recovery certification.
4. Run `VALIDATE`; any task-evidence change after validation invalidates the readiness result. Revalidate before authorization.
5. Authorize the exact validated version, then publish it. Publication yields `PUBLISHED`, not `LIVE`.
6. Use `VERIFY RELEASE` only with real deployment/runtime evidence and completed certification tasks. Verification yields `VERIFIED`.
7. Use `ACTIVATE MARKET` only after verification. Activation yields `LIVE` and `INVITE_ONLY` onboarding. Opening onboarding is a separate governed decision.
8. If a publication operation is `RECOVERY_REQUIRED`, inspect the operation stage and current canonical state first. `RESUME CONTROLLED RECOVERY` is explicit and step-up protected; it replays the idempotent reconciliation pipeline. It does not claim cross-domain transaction atomicity. If identity conflicts remain, stop and reconcile manually.
9. Export the launch report after completion and retain it with the release record. It is a summary of recorded evidence, not a legal certification by itself.
