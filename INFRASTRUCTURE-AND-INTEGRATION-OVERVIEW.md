# ON Mission — Infrastructure Review & Integration Handover

Review basis: source archive 16.100.0, cumulative candidate 16.105.0. This is a source/configuration review, not a live Cloudflare account audit. No credentials, provider control-plane access, production telemetry export, D1 backup report, or authenticated production session was supplied.

## 1. Executive architecture view

ON Mission is a Cloudflare Workers application. The Worker entry point (`_worker.js`) creates the application router and handles HTTP requests. Static browser assets are served from the `public/` directory through the Workers Assets binding. API requests are routed to domain/module route registrars in `src/worker/app.js`.

The system is not a single external workflow engine. It is a modular mission-execution platform with canonical domain authorities, security middleware, mission and assignment domains, controlled action execution, provider integration, agentic extensions, and a Super Admin control plane.

### Runtime components declared in `wrangler.jsonc`

| Component | Binding / resource | Intended role | What source proves |
|---|---|---|---|
| Compute/API | Cloudflare Worker `onmissionok-repo` | HTTP API, orchestration, scheduled jobs | Worker entry point and route composition exist |
| Browser delivery | Workers Assets `ASSETS` → `public/` | Static app/UI delivery | Asset binding and router fallback exist |
| Canonical database | D1 `DB`, database `onmission-db` | Persistent operational and governance records | Binding is declared; canonical DB helpers exist |
| Fast ephemeral state | KV `KV_BINDING` | Sessions, revocation, rate limiting and short-lived access cache | Multiple services use KV; it is not the canonical database |
| File/object storage | R2 `FILES`, bucket `onmission-files` | Uploaded files and evidence objects | Binding and file repositories exist; live object access not proven here |
| AI inference | Workers AI `AI` | Embeddings and agent support | Agent semantic memory code calls `AI.run` |
| Vector retrieval | Vectorize `AGENT_VECTORIZE`, index `onmission-agent-memory` | Semantic memory retrieval | Agent semantic memory code uses namespaces and tenant-scoped retrieval |
| Scheduled processing | Cron `17 3 * * *` | Retention cleanup, semantic indexing, recalibration, execution recovery | `_worker.js` scheduled handler dispatches these jobs |

## 2. Request and execution flow

1. Browser loads versioned static assets from Workers Assets.
2. Browser calls `/api/...` endpoints on the same Worker origin.
3. The shared router validates mutation request security, reads session context where required, applies security headers, request IDs and request observability, then dispatches to the registered domain route.
4. Route handlers authenticate and authorize the caller. Sensitive Super Admin operations use step-up authorization and audit records.
5. Domain services call their owning repositories/authorities. Canonical D1 access is wrapped by `canonicalFirst`, `canonicalAll` and `canonicalRun`; database failures become `503 AUTHORITY_UNAVAILABLE`, not valid-looking empty state.
6. Mutations should pass through the owning service and its authorization, precondition, audit, and read-back contracts. An integration must not write directly to ON Mission tables.
7. Mission and external effects are handled through controlled action/provider boundaries. Agent memory is advisory: retrieved context must be revalidated against canonical authorities before it can influence action.

## 3. Mission operating model

The intended governed lifecycle is:

`OBSERVE → UNDERSTAND → PLAN → EVALUATE → ACCEPT → AUTHORIZE → PREPARE → ASSIGN → EXECUTE → EFFECT → VERIFY → RECOVER → OUTCOME → LEARN → NEXT SITUATION → OBSERVE`

Conceptually:

- **Mission** is the requested outcome and its constraints.
- **Tenant / identity / policy** determine who owns the request and what is permitted.
- **Responsibility / assignment / resource** determine who or what may perform each part.
- **Action / provider** represent controlled operations and external capabilities.
- **Evidence / verification / audit** establish what happened, who authorized it, and whether the outcome is valid.
- **Recovery / reconciliation** handle partial failures and uncertain external effects.
- **Intelligence / agents** can observe, recommend, prepare and coordinate within governed capabilities; they do not replace canonical authority.

For the initial Germany Logistics pilot, keep physical execution human-authorized. Do not grant an external system or agent direct physical actuation authority until a separate capability, consent, safety case, authorization, verification and recovery contract has been approved and tested.

## 4. Authority and storage boundaries

- **D1 is the configured persistent authority.** KV is used for short-lived/session/cache concerns; it must not become a second mission truth.
- **R2 is object storage**, not the source of lifecycle truth. Evidence metadata, ownership, integrity and access decisions should remain linked to canonical records.
- **Vectorize is advisory retrieval.** Tenant namespace separation and canonical revalidation are present in the semantic-memory implementation; vector results must never authorize an operation.
- **AI is a capability provider**, not an authority. AI output is untrusted input and must be constrained by contracts and policy.
- **Market Factory owns market packages and versions.** A package version is immutable; changes should create a new version. Resource relationship, tenant, identity, mission, provider and product authorities remain separate.

## 5. Security and governance observed in source

The shared router includes mutation-request validation, session-aware read-only delegation handling, request IDs, observability and security headers. Super Admin routes use administrator checks; high-impact infrastructure mutations require step-up and produce admin audit events. Canonical DB helpers convert DB exceptions into an explicit authority-unavailable response. Market launch uses distinct task evidence and release lifecycle transitions. The scheduled Worker runs privacy retention cleanup and agent indexing/recalibration/execution-recovery jobs.

This is a positive architecture foundation. It does not prove that every route has been penetration-tested, every SQL query is tenant-scoped, every secret is rotated, or every external action has idempotent replay protection. Those require route-by-route and production runtime verification.

## 6. Germany data-residency and infrastructure findings

The Worker config declares `PRIMARY_DATA_JURISDICTION=DE`, `GERMANY_DATA_RESIDENCY=required` and `DATA_PLANE_MODE=jurisdiction-policy`. It also declares Cloudflare-managed D1, KV, R2, Workers AI and Vectorize resources. These settings express policy intent; they do not independently prove the physical location of all processing, replicas, logs, backups, support access, AI inference, vector indexes, or subprocessors.

The existing infrastructure governance route itself correctly labels binding presence as `CONFIGURED_UNVERIFIED`, and D1 as `REACHABLE` only after a live `SELECT 1`. It explicitly says no provider control-plane API is connected and that jurisdiction is unverified. The source therefore does not support a claim of fully certified Germany-only data residency.

The current `wrangler.jsonc` does not contain an independently verifiable backup/restore policy or a D1 recovery test record. The source production-readiness gate also prints a warning that production D1 migration `0036` must be applied before relying on its indexes; the source archive cannot prove which migrations have actually been applied in the production D1 database. Confirm the live migration ledger before release. The cron schedule is visible, but successful completion and alerting for scheduled jobs must be confirmed from production telemetry. The Worker is globally served by Cloudflare; do not assume request execution location equals database or object-storage residency.

### Priority infrastructure actions

1. Obtain Cloudflare account-level evidence for D1, KV, R2, AI and Vectorize region/data-location capabilities and actual configured locations; map logs, analytics, backups, support and subprocessors too.
2. Document and test D1 backup/PITR and restore into a controlled recovery environment; record RPO/RTO, restore evidence and responsible owner.
3. Verify R2 object retention, encryption, access policy, versioning/recovery and evidence-object integrity.
4. Verify secret inventory, scope, rotation, environment separation and emergency revocation. Secrets must remain in Cloudflare secret bindings, never source or market-package JSON.
5. Add production alerts for Worker errors/latency, D1 failures, KV/R2 errors, cron failures, provider timeouts, queue/reconciliation backlog, failed mission verification and audit-write failures.
6. Run tenant-isolation, authorization/step-up, replay/idempotency, SSRF/input, file-upload, webhook-signature, rate-limit and failure-recovery tests against a staging deployment.

## 7. How a second system should integrate with ON Mission

Use a **one-way integration adapter at first**. The external system submits a mission request or supplies reference data; ON Mission remains the authority for mission state, authorization, assignment, action execution and outcome evidence.

### Recommended integration sequence

1. **Register the integration** as a named provider/client with a dedicated environment, tenant scope, capabilities and owner.
2. **Authenticate server-to-server** using a dedicated credential (OAuth2 client credentials or signed service token, depending on the agreed contract). Store secrets in Cloudflare secret bindings or the external secret manager; never send them in browser code.
3. **Exchange only identifiers and minimum necessary data.** Use stable external IDs, tenant ID, schema version, correlation ID and idempotency key. Avoid copying entire customer databases.
4. **Submit a mission intent**, not a direct execution command. ON Mission validates tenant, actor, policy, required fields, market capability, risk and preconditions.
5. **Receive an acknowledgement** with ON Mission mission ID, accepted/rejected status, correlation ID and next expected state. Acceptance is not authorization to execute.
6. **Track state via an agreed read API or signed event/webhook.** Events should be versioned, signed, replay-protected, idempotent and correlated to the originating request. Consumers must tolerate duplicate and out-of-order delivery and re-read canonical state.
7. **Return outcomes and evidence references** only after the owning ON Mission verification authority has confirmed them. Never infer success from a provider's HTTP 200 or a submitted evidence string.
8. **Reconcile failures** using stable idempotency keys and explicit states such as accepted, blocked, in progress, effect pending, verified, recovery required and rejected. Never retry a non-idempotent physical effect blindly.

### Suggested integration contract (conceptual; agree the actual API schema before implementation)

| Field | Purpose |
|---|---|
| `schemaVersion` | Versioned payload contract |
| `externalSystem` | Registered integration identity |
| `externalTenantId` | External tenant reference, mapped to one ON Mission tenant |
| `externalRequestId` | Stable request identity in the source system |
| `idempotencyKey` | Prevent duplicate mission creation/effects |
| `correlationId` | Trace one business transaction across systems |
| `requestedOutcome` | Outcome requested, not an executable low-level command |
| `constraints` | Time, geography, eligibility, safety, service-level requirements |
| `objects` | Minimal object references/data needed for the mission |
| `evidenceRefs` | External source references; claims still require verification |
| `callback` | Optional signed callback endpoint and event subscription configuration |

### Integration boundaries

- Do not connect the external system directly to D1, KV or R2.
- Do not allow the external system to mutate assignments, mission lifecycle or audit tables.
- Do not treat agent/vector memory as integration truth.
- Do not accept arbitrary URLs or credentials in mission payloads; provider endpoints must be allow-listed and protected against SSRF.
- Enforce tenant mapping, least privilege, schema validation, request size limits, replay protection, idempotency and audit on every mutation.
- Start with read-only status synchronization and controlled mission-intent submission. Add outbound actions only after an explicit provider capability contract and supervised test.

## 8. Information needed to finalize the integration design

To map the two systems precisely, the integration owner should provide:

- External system name, version, hosting model and environment (production/staging).
- Its role: source of mission requests, master-data source, provider/executor, ERP/TMS/WMS, customer portal, or analytics consumer.
- Available API specifications, webhook/event schemas and authentication methods.
- Tenant/customer identifier model and data ownership rules.
- Data categories, legal basis/consent, retention, transfer countries and data-residency constraints.
- Expected volumes, peak rate, latency/SLA, retry policy and outage tolerance.
- Whether the integration can cause physical or financial side effects, and who authorizes them.

## 9. Review conclusion

ON Mission has a credible modular foundation for a governed execution platform: a Worker API, canonical D1 access helpers, scoped ephemeral storage, object storage, AI/vector extensions, explicit route boundaries, audit/security middleware, scheduled recovery/maintenance, and separate market-release governance. The principal integration rule is to preserve ON Mission as the mission and authorization authority and connect the second system through a narrow, versioned adapter. The new Market Factory proof matrix is intentionally fail-closed: the current certification route does not yet inject a trusted real-mission proof result, so its eight proof cases remain `EVIDENCE_REQUIRED` until a tenant-scoped mission and adversarial test evidence source is explicitly connected.

The highest risks to close before a production-to-production integration are independently verified Germany data location and subprocessors, tested backup/restore, production observability/alerting for scheduled and external work, route-by-route tenant isolation, and explicit provider idempotency/reconciliation contracts. Treat those as evidence-backed work items, not configuration assumptions.
