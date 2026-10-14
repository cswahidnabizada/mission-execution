# ON Mission 11.08.0 — Semantic Memory Provider Setup

11.08.0 keeps Workers AI and Vectorize optional so the existing production Worker cannot become unavailable merely because the semantic providers have not been provisioned.

## Production resources

Use Cloudflare Workers AI with the BGE base embedding model and a Vectorize V2 index configured for:

- dimensions: `768`
- metric: `cosine`
- binding: `AGENT_VECTORIZE`
- namespace: `company:<companyId>`

The Worker AI binding is named `AI`.

## Provision the Vectorize index

Run from an authenticated Wrangler environment:

```bash
npx wrangler vectorize create onmission-agent-memory --dimensions=768 --metric=cosine --binding=AGENT_VECTORIZE --update-config
```

Then add the Workers AI binding to `wrangler.jsonc`:

```jsonc
"ai": {
  "binding": "AI"
}
```

The Vectorize configuration should be:

```jsonc
"vectorize": [
  {
    "binding": "AGENT_VECTORIZE",
    "index_name": "onmission-agent-memory"
  }
]
```

The index configuration is immutable, so do not change dimensions or metric after creation.

## Safety

Do not enable agent autonomous execution just because semantic retrieval is available. Semantic retrieval is advisory memory. The agent still has to pass the Agentic Control Plane, decision binding, canonical authorization, action risk gate, lifecycle/state fencing, evidence and outcome verification.

## Verification after provisioning

1. `GET /api/agent/semantic/status` must report `enabled: true`.
2. Produce a verified agent outcome on a test mission.
3. Confirm a semantic projection is `PENDING` in Super Admin Agentic Control.
4. Run the scheduled indexing pass or use the step-up Super Admin reindex operation.
5. Confirm the projection becomes `INDEXED`.
6. Run tenant-scoped semantic search.
7. Confirm results only contain missions the requesting user can access.
8. Confirm the returned result is marked `advisoryOnly` and `authorizationInference: false`.
9. Verify tenant erasure removes both D1 semantic documents and their Vectorize IDs.
10. Keep high-impact and irreversible autonomy disabled.
