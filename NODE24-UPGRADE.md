# Mission Execution — Cloudflare Node 24 build contract

This release aligns the build-toolchain contract with Cloudflare Workers Builds default Node.js 24.18.0. It accepts npm 10.x and 11.x because Cloudflare logs have shown both the preinstalled npm 10.9.2 tool and npm 11.16.0 during dependency installation.

## Contract changes
- `.node-version` and `.nvmrc`: `24.18.0`
- `package.json` and lockfile root engines: Node `24.x`, npm `>=10 <12`
- Build preflight validates Node major 24 and npm major 10 or 11.
- Exact `packageManager` pin removed to avoid contradicting observed Cloudflare npm versions.
- Governed deploy sequence and release gates are preserved.
- No database migration was added; migration high-water mark remains `0154`.

## Cloudflare Workers Builds settings
- Root directory: `/` when this archive's contents are the repository root.
- Build command: leave empty (the production deploy script runs the build).
- Deploy command: `npm run deploy:production`.
- Build variable: `NODE_VERSION=24.18.0`.
- Commit `.node-version` at the root of the connected production branch.

This is a source/configuration update, not evidence of successful full build, production certification, or live deployment.
