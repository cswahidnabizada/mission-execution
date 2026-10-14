# ON Mission 10.90.0 — Human Work Surface Inventory & Convergence Map

## Wave 1 achievement

Wave 1 is complete: every discovered HTML surface, frontend JS module and Control Plane workspace is classified into a canonical disposition for the Human Work Model. This is an inventory/authority map, not a second runtime authority.

### Permanent rule

> Everything that represents human work becomes reachable through the Human Work Model; not everything belongs on Today. Contextual workspaces remain the place for detail and domain-specific understanding.

### Dispositions

- **KEEP** — already canonical and remains a supported surface.
- **CONVERT TO CONTEXT** — existing page/entry becomes a contextual destination inside the Human Work Model.
- **RETIRE/REDIRECT** — compatibility route only; canonical destination already exists.
- **KEEP SEPARATE** — public, support, developer or Control Plane boundary that should not become tenant operational work.
- **REVIEW** — explicit follow-up required; no hidden automatic migration.

## Summary

- HTML surfaces: 24
- Frontend JS modules: {len(js_files)}
- Control Plane workspaces: {sum(1 for x in items if x["surface_type"]=="ADMIN WORKSPACE")}
- Inventory entries: {len(items)}

- ADMIN WORKSPACE / KEEP / CONTROL PLANE: 28
- HTML / CONVERT TO CONTEXT: 5
- HTML / KEEP: 2
- HTML / KEEP SEPARATE: 8
- HTML / RETIRE/REDIRECT: 8
- HTML / REVIEW: 1
- JS / CONVERT TO CONTEXT: 5
- JS / KEEP / CANONICAL COMPOSER: 2
- JS / KEEP / COMPOSE: 30
- JS / KEEP / CONVERGE: 40
- JS / KEEP / SUPPORT: 26
- JS / KEEP SEPARATE: 5
- JS / REVIEW: 10

## Human-facing HTML surface decisions

| Surface | Disposition | Canonical target |
|---|---|---|
| `public/accept-invitation.html` | **CONVERT TO CONTEXT** | `/app#network` |
| `public/access.html` | **CONVERT TO CONTEXT** | `/app#account` |
| `public/admin/index.html` | **RETIRE/REDIRECT** | `/` |
| `public/admin-control.html` | **RETIRE/REDIRECT** | `/` |
| `public/admin.html` | **RETIRE/REDIRECT** | `/` |
| `public/app/index.html` | **KEEP** | `/app` |
| `public/developer/index.html` | **KEEP SEPARATE** | `/developer` |
| `public/driver/dashboard.html` | **RETIRE/REDIRECT** | `/app#work` |
| `public/driver/index.html` | **REVIEW** | `public/driver/index.html` |
| `public/forgot-password.html` | **KEEP SEPARATE** | `public/forgot-password.html` |
| `public/foryou/index.html` | **CONVERT TO CONTEXT** | `/app#network` |
| `public/index.html` | **KEEP SEPARATE** | `public/index.html` |
| `public/login.html` | **KEEP SEPARATE** | `public/login.html` |
| `public/marketplace/index.html` | **RETIRE/REDIRECT** | `/foryou` |
| `public/missions.html` | **RETIRE/REDIRECT** | `/app#work` |
| `public/my-driver/index.html` | **RETIRE/REDIRECT** | `/app#people` |
| `public/platform/access/admin/index.html` | **KEEP** | `/platform/access/admin` |
| `public/register.html` | **KEEP SEPARATE** | `public/register.html` |
| `public/reset-password.html` | **KEEP SEPARATE** | `public/reset-password.html` |
| `public/role-workspace.html` | **RETIRE/REDIRECT** | `/app#work` |
| `public/status.html` | **KEEP SEPARATE** | `/status.html` |
| `public/subscription.html` | **CONVERT TO CONTEXT** | `/app#account` |
| `public/support/index.html` | **KEEP SEPARATE** | `/support` |
| `public/verification.html` | **CONVERT TO CONTEXT** | `/app#account` |

## Control Plane workspace decisions

| Workspace | Disposition | Target |
|---|---|---|
| `admin:product-publisher` | **KEEP / CONTROL PLANE** | `/platform/access/admin#product-publisher` |
| `admin:data-catalog` | **KEEP / CONTROL PLANE** | `/platform/access/admin#data-catalog` |
| `admin:data-studio` | **KEEP / CONTROL PLANE** | `/platform/access/admin#data-studio` |
| `admin:countries` | **KEEP / CONTROL PLANE** | `/platform/access/admin#countries` |
| `admin:product-verification` | **KEEP / CONTROL PLANE** | `/platform/access/admin#product-verification` |
| `admin:product-health` | **KEEP / CONTROL PLANE** | `/platform/access/admin#product-health` |
| `admin:system-health` | **KEEP / CONTROL PLANE** | `/platform/access/admin#system-health` |
| `admin:companies` | **KEEP / CONTROL PLANE** | `/platform/access/admin#companies` |
| `admin:roles` | **KEEP / CONTROL PLANE** | `/platform/access/admin#roles` |
| `admin:subscriptions` | **KEEP / CONTROL PLANE** | `/platform/access/admin#subscriptions` |
| `admin:billing` | **KEEP / CONTROL PLANE** | `/platform/access/admin#billing` |
| `admin:policies` | **KEEP / CONTROL PLANE** | `/platform/access/admin#policies` |
| `admin:consent` | **KEEP / CONTROL PLANE** | `/platform/access/admin#consent` |
| `admin:residency` | **KEEP / CONTROL PLANE** | `/platform/access/admin#residency` |
| `admin:providers` | **KEEP / CONTROL PLANE** | `/platform/access/admin#providers` |
| `admin:analytics-governance` | **KEEP / CONTROL PLANE** | `/platform/access/admin#analytics-governance` |
| `admin:privacy-rights` | **KEEP / CONTROL PLANE** | `/platform/access/admin#privacy-rights` |
| `admin:certification` | **KEEP / CONTROL PLANE** | `/platform/access/admin#certification` |
| `admin:audit` | **KEEP / CONTROL PLANE** | `/platform/access/admin#audit` |
| `admin:security` | **KEEP / CONTROL PLANE** | `/platform/access/admin#security` |
| `admin:backup-recovery` | **KEEP / CONTROL PLANE** | `/platform/access/admin#backup-recovery` |
| `admin:recovery-reconciliation` | **KEEP / CONTROL PLANE** | `/platform/access/admin#recovery-reconciliation` |
| `admin:trash` | **KEEP / CONTROL PLANE** | `/platform/access/admin#trash` |
| `admin:data-control` | **KEEP / CONTROL PLANE** | `/platform/access/admin#data-control` |
| `admin:data-entry` | **KEEP / CONTROL PLANE** | `/platform/access/admin#data-entry` |
| `admin:verification` | **KEEP / CONTROL PLANE** | `/platform/access/admin#verification` |
| `admin:notifications` | **KEEP / CONTROL PLANE** | `/platform/access/admin#notifications` |
| `admin:missions` | **KEEP / CONTROL PLANE** | `/platform/access/admin#missions` |

## Frontend module rules

| Module family | Disposition | Rule |
|---|---|---|
| `frontend/work/*` | **KEEP / CANONICAL COMPOSER** | One Human Work Model. |
| `frontend/app/*`, `shell/*`, `navigation/*`, `situation/*` | **KEEP / CONVERGE** | Human operating shell. |
| `frontend/admin/*` | **KEEP / CONTROL PLANE** | Separate Admin Work Model/Control Plane. |
| `frontend/core/*` | **KEEP / SUPPORT** | Shared client boundaries, not user surfaces. |
| `frontend/extensions/*` | **KEEP / CONVERGE** | Consume through canonical contexts; no competing work authority. |
| `pages/*` | **CONVERT/REVIEW** | Existing page implementations become context implementations or are retired only after parity. |

## Wave 2 entry criteria

Wave 2 may start only after this inventory remains green in the release gate. Wave 2 will define the single `HumanWorkItem` contract and adapter boundary; it must consume this map rather than discovering surfaces again.

## What is deliberately not merged

- Control Plane remains a separate application boundary.
- Public authentication/onboarding remains separate.
- Developer/support remain separate.
- Public system status remains separate.
- Canonical domain authorities remain separate from the Human Work Model.
- Today remains a focus/orientation surface, not a dumping ground.
