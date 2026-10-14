import fs from 'node:fs';import assert from 'node:assert/strict';
const c=fs.readFileSync('public/assets/ui/canonical-ui-system.css','utf8');assert.match(c,/\.work-shell\{display:grid/);assert.match(c,/grid-template-columns:minmax\(280px,380px\)/);console.log('Canonical dashboard width + queue: PASS');
