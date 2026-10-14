#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

printf '%s\n' "ON Mission deterministic release build: $(cat VERSION)"

node scripts/check-migration-contract.mjs
node scripts/check-schema-current.mjs
node scripts/check-release-engineering.mjs
node scripts/check-migration-data-dependencies.mjs
node scripts/check-release-integrity.mjs

# CSS is part of the shipped product surface. A missing Tailwind CLI is a build
# failure, not a reason to deploy with potentially stale generated CSS.
npm run build:css

node --check src/worker/app.js
node scripts/generate-release-manifest.mjs
npm run check:release
printf '%s\n' 'Deterministic release build validation complete.'
