# ON Mission Agentic Layer Architecture — 11.07.0

## Purpose

The Agentic Layer is a derived, governed intelligence layer above the canonical ON Mission platform. It never owns operational truth.

## Operating loop

Observe → Intent → Context → Alignment → Plan → Risk / Policy Gate → Authorization → Execute → Verify → Evidence → Outcome → Learn → Recalibrate → Next Intent

## Three-plane boundary

```text
SUPER ADMIN CONTROL PLANE
        │
        │ governance / audit / safety
        ▼
AGENTIC PLANE
 Context · Decisions · Memory · Planner · Outcomes · Learning
        │
        │ governed canonical action boundary
        ▼
CANONICAL CORE / OPERATIONS PLANE
 Truth · Authorization · Actions · Lifecycle · Evidence · D1
```

Super Admin governs the agentic runtime but does not become a Mission, Assignment, Lifecycle, Authorization or Outcome authority.

## Context

`GET /api/agent/context/missions/:missionId` provides a single agent-readable mission context assembled from existing canonical Mission, Assignment, Lifecycle, Authorization, Action and Evidence authorities. The response is derived and includes a SHA-256 context hash plus the current Agentic Governance posture and per-action execution eligibility projection.

## Decision integrity

`POST /api/agent/decisions` creates an append-only decision event before any agent execution attempt. A decision binds:

- tenant/company;
- mission;
- executor when applicable;
- agent identity;
- canonical action code;
- context version and context hash;
- intent;
- plan;
- candidate actions;
- alignment;
- risk class;
- confidence;
- policy version;
- autonomy level.

Decision events are idempotent by `decision_id`, hash chained per company, and protected against UPDATE/DELETE.

## Agentic Control Plane

Super Admin can inspect and govern the Agentic Layer through `/api/platform/admin/agentic-control`.

The control posture is:

- `DISABLED` — agent execution unavailable;
- `RECOMMEND_ONLY` — recommendations only;
- `PREPARE_ONLY` — prepare decisions but do not execute;
- `CONTROLLED_EXECUTION` — execution may occur only when autonomy and action risk gates permit it.

Default production posture is `RECOMMEND_ONLY`, autonomy level 1, execution disabled.

Controlled execution requires Super Admin step-up and is recorded in the canonical administrative audit stream. Emergency disablement blocks agent execution while leaving context and audit available.

## Execution gate

When a canonical action carries an agent decision identity, the canonical action application service requires:

1. an existing decision event;
2. matching company/tenant;
3. matching mission;
4. matching canonical action;
5. matching context hash;
6. Agentic Control Plane execution enabled;
7. sufficient autonomy for the action risk class;
8. no high-impact or irreversible autonomous execution.

After those gates, the existing canonical action authorization and domain execution pipeline remains authoritative.

## Agent memory / outcome profiles

11.06.0 adds derived memory projections from the outcome ledger:

- executor outcome profile scoped by `(company_id, executor_id)`;
- organization outcome profile scoped by `company_id`;
- canonical-action outcome profile scoped by `(company_id, action_code)`.

Profiles contain observed counts and an observed favorable rate based only on known outcomes. `UNKNOWN` is retained as its own count and is excluded from the favorable denominator. Profiles are mutable derived projections, not append-only truth. A newly committed outcome event and all applicable profile increments are committed together through D1 batch execution.

The agent mission context exposes these profiles as `memory`, explicitly marked `derivedOnly`. Memory may influence future alignment/planning but cannot authorize, mutate canonical truth, or replace current context.

## Outcome ledger

`agent_outcome_events` stores decision/outcome pairs as derived learning evidence. It is idempotent by `decision_id`, append-only, and hash chained per company. Database triggers reject UPDATE and DELETE.

Each record captures the decision identity, canonical action, context hash, plan, authorization result, execution status, operational outcome, confidence, evidence, state versions, model identity, policy version and recalibration version.

Execution success is not automatically treated as operational success. Outcome derivation uses canonical before/after state and evidence. `UNKNOWN` remains `UNKNOWN`.

## Learning boundary

Future executor profiles, mission outcome history, vector retrieval and recalibration stores must consume decision/outcome events and canonical read models. They must never write back into canonical operational truth.

## Planned stages

1. **11.05.0 — Context + Outcome Foundation**
2. **11.05.1 — Agentic Control Plane + Decision Integrity**
3. **11.06.0 — Executor / Organization / Action Outcome Profiles**
4. **11.07.0 — Mission Outcome History / Trajectory** ← current
4. **11.07 — Mission Outcome History**
5. **11.08 — Semantic / Vector Retrieval**
6. **11.09 — Recalibration Store**
7. **11.10 — Agent Planner / Policy Gate**
8. **11.11 — Governed Agent Execution Expansion**
9. **Continuous Evaluation / Adaptation**

## Non-negotiable invariants

- Canonical truth remains the sole operational authority.
- Agent memory is not truth.
- Embeddings are not truth.
- Learned weights are not policy.
- Predictions are not facts.
- Authorization remains server-side and canonical.
- Every agent mutation is a canonical action.
- Every execution-capable agent decision is recorded before execution.
- Every executed agent action has an outcome/evidence trail.
- Memory projections are derived only from verified ledger events and remain tenant scoped.
- Historical memory never overrides current canonical context or authorization.
- Unknown or unverifiable outcomes never become successful learning labels.
- High-impact and irreversible actions require human governance and are not autonomously executed by this layer.
- Tenant boundaries apply to context, decisions, memory, retrieval and learning data.
- The agent never receives raw SQL or arbitrary mutation tools.


## 11.07.0 — Mission Outcome History

11.07.0 adds a read-only mission trajectory composed from canonical status history, canonical transition events, canonical evidence/exception records, and verified agent outcome events. It answers the agent's execution-history questions without creating a second mission-history authority.

The trajectory contract is: `Situation → Intent → Alignment → Action → Execution → Result → Evidence → Outcome → Recovery Signal → Next Situation`. Recovery is only marked observed when a later canonical transition/exception resolution or later agent decision provides evidence; an adverse outcome without such evidence remains an unresolved recovery requirement.

The full history is available through a tenant-scoped read endpoint, while the live agent context receives a bounded recent projection plus aggregate summary. Historical retrieval must always be revalidated against current canonical truth before it is used for a decision.


## 11.08.0 — Semantic / Vector Retrieval

11.08.0 adds a semantic-memory projection over the derived mission trajectory. The projection is minimized, tenant-scoped and hash-addressed. Workers AI produces 768-dimensional BGE embeddings and Cloudflare Vectorize stores them in tenant namespaces when the corresponding bindings are provisioned.

Semantic retrieval is never a source of truth. A retrieved result must pass current canonical mission existence and user mission-access revalidation. Similarity does not authorize an action, establish a mission state, or override current evidence.

Provider absence is explicit: the Agent Context remains usable and reports semantic retrieval as unavailable rather than substituting fake embeddings or silently falling back to an unbounded database scan.

Vector IDs are deterministic, semantic projection records remain in D1 for provenance and privacy governance, and tenant erasure removes both D1 projections and provisioned Vectorize vectors.

Recommended production provisioning:

```text
Workers AI binding: AI
Vectorize binding: AGENT_VECTORIZE
Vectorize index: 768 dimensions, cosine metric
Tenant isolation: namespace company:<companyId>
```

Cloudflare documents Vectorize bindings, similarity query, namespaces and metadata filtering as the supported Worker integration pattern. The BGE base embedding model produces 768-dimensional vectors.
