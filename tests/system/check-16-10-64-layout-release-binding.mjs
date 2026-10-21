import assert from 'node:assert/strict';
import fs from 'node:fs';
const lifecycle=fs.readFileSync('src/worker/modules/admin-control/product-release-lifecycle.service.js','utf8');
const routes=fs.readFileSync('src/worker/modules/admin-control/layout-studio.routes.js','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const manifest=JSON.parse(fs.readFileSync('RELEASE-MANIFEST.json','utf8'));
assert.equal(manifest.version,pkg.version);
assert.match(manifest.base,/^16\.10\.(6[3456789]|70|71|72|73|74|75|76|77|78|79|80|81|82|83|84|85|86|87|88|89)$/); // historical contract must remain valid as later candidates advance
assert.match(lifecycle,/layoutArtifactBindingRequired/);
assert.match(lifecycle,/PRODUCT_RELEASE_LAYOUT_BINDING_REQUIRED/);
assert.match(lifecycle,/PRODUCT_RELEASE_LAYOUT_ARTIFACT_INTEGRITY_FAILED/);
assert.match(lifecycle,/platform_layout_draft_versions WHERE version_id=\? AND experience_id=\?/);
assert.match(lifecycle,/layoutArtifact:layoutArtifactBinding/);
assert.match(routes,/LAYOUT_STUDIO_RELEASE='16\.10\.(64|65|66|67|68)'/);
assert.match(pkg.scripts['check:release'],/check-16-10-64-layout-release-binding\.mjs/);
console.log('16.10.64 canonical layout release binding contract: PASS');
