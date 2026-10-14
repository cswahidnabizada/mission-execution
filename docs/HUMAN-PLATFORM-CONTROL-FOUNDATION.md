# ON Mission 10.96.0 — Human Platform Control Foundation

10.96.0 establishes the Super Admin Control Plane as the governance and orchestration layer for the Human Working Platform.

## Permanent boundary

Super Admin controls experience configuration, governance, release, observability and recovery. It does not own Mission truth, Assignment truth, lifecycle truth, evidence validity, tenant data or direct domain mutation.

## Canonical experience model

- Today — orientation and what matters now
- Work — universal operational execution
- Network — collaboration and connected relationships
- Objects — operational object context
- People — people, responsibility and access context
- Account — identity, readiness, billing and security

Contextual workspaces remain entered from human work rather than becoming a seventh navigation destination.

## Governed configuration

Human Platform experience configuration reuses the existing canonical `platform_configuration_versions` authority with:

- domain: `rendering`
- key: `human-work-platform`
- contract: `human-work-platform.v1`

Configuration progresses through the existing governed lifecycle: draft → validated → authorized → active, with rollback creating a new governed draft.

## Controlled configuration

The foundation governs:

- six canonical destinations
- Work composition sources
- contextual workspace availability
- role experience defaults
- attention presentation policy
- experience safety invariants

The six canonical destinations cannot be deleted or replaced by configuration.

## Security boundary

All mutations require Super Admin step-up. Authorization remains server-side. Human Platform configuration is presentation/policy configuration and cannot grant domain authorization or bypass the canonical Action Registry.
