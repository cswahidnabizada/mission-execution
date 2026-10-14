# Human Work Model — Canonical HumanWorkItem Contract

## Purpose

`HumanWorkItem` is the single presentation contract used by the Human Work Model. It makes operational work understandable to a person without replacing the canonical authorities underneath it.

```text
Canonical read authorities
        ↓
HumanWorkItem adapter
        ↓
Today / Work / contextual surfaces
        ↓
Canonical Action / Command boundary
```

## Contract rule

A HumanWorkItem is **immutable, read/composition-only, tenant-scoped, and non-authoritative for mutation**.

It answers:

- What is the current situation?
- Who is responsible?
- Why does it matter?
- What context explains it?
- Is there a valid action or is it waiting?
- What evidence supports the presentation?
- What state comes next?

It does **not** decide truth, authorization, lifecycle, assignment, recovery, or whether a mutation is permitted.

## Canonical fields

```text
id
 type
 situation
 priority
 responsibility
 sourceAuthority
 reason
 context
 availableAction
 waitingCondition
 evidence
 nextState
 state
 status
 updatedAt
 deadlineAt
 degraded
```

## Surface rule

The UI must consume the contract instead of inventing flat work-row objects such as:

```text
workState + reference + reason + link
```

Those source values may still exist inside a domain adapter while being normalized, but they do not cross the Human Work Model boundary as a competing presentation contract.

## Action safety

`availableAction` is a descriptor. It can point to the canonical workspace or action route, but it does not execute a mutation. All mutations continue through the existing secured Action Registry / command authority with the existing authorization, state-token, tenant, step-up and audit controls.

## Domain separation

The Human Work Model composes canonical authorities:

- Mission truth
- Assignment truth
- Liveness / recovery posture
- Attention signals
- Network truth
- People / responsibility truth
- Object truth
- Product truth

A domain remains the owner of its own truth. Wave 3 converts additional surfaces into this contract; it does not merge those authorities.
