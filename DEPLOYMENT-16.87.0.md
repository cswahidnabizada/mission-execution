# Deploy ON Mission 16.87.0

## Before deployment

- Use Node.js **24.22.1** (`.node-version`) and npm 10.x/11.x.
- Confirm the Cloudflare account, Worker, D1 database and bindings point to the intended production environment.
- Take/verify a recoverable production D1 backup.
- Do not paste credentials, tokens or private customer data into source files or chat.

## Recommended Cloudflare build/deploy commands

Build command:

```sh
npm ci
npm run build
npm run check:release
npm run check:health
npm run check:migrations
```

Deploy command, after the build succeeds:

```sh
npm run migrate:production
npx wrangler deploy
```

The D1 binding explicitly configures `migrations_dir` as `database/migrations`. `npm run migrate:production` applies the ordered remote migrations and reports the high-water mark. A bare `npx wrangler deploy` does **not** apply D1 migrations.

To use the all-in-one controlled production script instead, configure the runtime certification environment variables below and run:

```sh
npm run deploy:production
```

## Runtime certification variables

The required runtime harness needs:

- `ON_MISSION_RUNTIME_URL`
- `ON_MISSION_CERT_COUNTRY`
- `ON_MISSION_CERT_EMAIL`
- `ON_MISSION_CERT_PASSWORD`
- `ON_MISSION_CERT_ATTACK_EMAIL`
- `ON_MISSION_CERT_ATTACK_PASSWORD`

Use dedicated controlled test accounts. The attack account should be a separate, minimally privileged identity. Store credentials as protected CI secrets; never commit them.

## After deployment

1. Verify remote D1 migration high-water mark `0166` with `npx wrangler d1 migrations list onmission-db --remote`.
2. Verify Worker release identity is `16.87.0`, health endpoints, static asset loading and authentication.
3. Sign in to Super Admin → Market Factory.
4. Select **Stage Germany Logistics**. This creates a draft Market Package only.
5. Open the draft and review the reconciliation preview. Resolve canonical country, sector, blueprint, Product Definition, policies, capabilities and provider dependencies through their owning authorities. Product Definitions are composed with version-pinned typed components during the publication pipeline and compiled by canonical launch validation.
6. Edit German/English page bodies, language assignments, privacy notice, terms, imprint and consent text in the structured editor or advanced package editor. Save changes as a new immutable Market Package version.
7. Configure the required email provider in Connections. The Market Factory integration gate requires an active, contract-approved provider, Germany-resident processing for this Germany-residency release, active capability registration and traceable connection-test evidence. Optional maps, Microsoft 365, ERP/SAP, billing and AI integrations remain disabled/not configured until deliberately selected.
8. Complete legal review using the actual provider/controller details, subprocessors, data flows, retention schedule, tax settings and signed agreements. The bundled legal text is a template, not legal approval.
9. Complete the Product Preparation Workspace. It requires source-backed research and operational decisions. If publication pauses at `VALIDATING_LAUNCH`, complete the canonical workspace and use the explicit Recover Publication action; do not re-import or blindly retry.
10. Complete Test Lab, signed release, publication, verification and activation evidence. Verify actual Germany/EU residency and backup/restore scope across every data service and subprocessor.
11. Activate the verified release with `INVITE_ONLY` onboarding first. Run the controlled runtime and tenant-isolation certification.
12. Only after operational approval should Super Admin change onboarding to `OPEN`. The homepage then directs users to `/register.html?market=DE-logistics&country=DE&sector=logistics`.
13. Complete a real Germany Logistics tenant onboarding and prove a physical mission from OBSERVE through verified OUTCOME and recovery handling.

## Stop conditions

Do not open public onboarding while legal text is unreviewed, canonical product/market resources are unresolved, the signed release is unverified, regional placement evidence is missing, production migration state is uncertain, or tenant-isolation/runtime tests have failed. A successful Worker deployment alone does not satisfy these conditions.
