# ON Mission 16.46.0 — Unified Release Identity and Commit Metadata Guard

## Changes
- Guard canonical record presence before commit metadata is accessed.
- Normalize updated timestamp aliases (`updated_at` / `updatedAt`) and return a stable `DATA_STUDIO_CANONICAL_RECORD_UNAVAILABLE` response when the authority projection is absent.
- Make the Data Studio client pass expected timestamp metadata safely, without dereferencing an absent record.
- Regenerate all runtime release identity files and cache-busting references from the canonical `VERSION` source.

## Verification boundary
Source-level regression and syntax checks are required. Cloudflare deployment, live save/reload, lifecycle operations, and cross-surface identity remain runtime verification tasks and are not claimed complete by packaging alone.
