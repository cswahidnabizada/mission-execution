# ON Mission 12.6.0 — Resource Management Workspace

## Canonical operating model

`CREATE → FIND → READ CANONICAL TRUTH → UNDERSTAND → CONTROL → USE → OBSERVE → GOVERN`

Resources is the single Super Admin operating surface for platform resources. Data Entry, Data Studio, Data Control and Trash remain implementation authorities underneath it.

## Workspace contract

- **Overview** — canonical identity, state, authority, current valid actions and core facts.
- **Use & Scope** — where the resource is intended to participate, its consumer boundary, and canonical connected records.
- **Dependencies** — derived relationships and selectable connected records; no second dependency store.
- **Lifecycle** — active/quarantined/restored state, dependency blockers and destructive-action posture.
- **Activity** — audit evidence for this resource; evidence is not truth.
- **Change** — the owning canonical editor (Data Studio for reusable resources).

## Creation contract

Resource creation is schema-driven from the canonical reusable definition. The form separates identity fields, configuration fields and structured payload fields, shows authority/risk, and requires validation before commit.

## Consumer model

A Super Admin-created reusable resource is platform truth. Products and tenant experiences may reference it only through their own canonical product, tenant-isolation, authorization, policy and eligibility boundaries. Super Admin authority does not leak to consumers.
