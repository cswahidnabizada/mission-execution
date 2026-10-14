import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const originalDocument = globalThis.document;
const overview = {
  innerHTML: '',
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
};
const nodes = new Map([['#view-overview', overview]]);
globalThis.document = {
  querySelector: (selector) => nodes.get(selector) || null,
  querySelectorAll: () => [],
};

try {
  const version=readFileSync('VERSION','utf8').trim();
  const mod = await import(`../../public/assets/js/frontend/admin/oversight/platform-governance.js?v=${version}`);
  assert.equal(typeof mod.renderOverview, 'function', 'platform governance must export renderOverview');
  await mod.renderOverview();
  assert.match(overview.innerHTML, /SUPER ADMIN|CONTROL CENTER|Composing platform situation/, 'overview renderer must invoke canonical Command Center');
} finally {
  globalThis.document = originalDocument;
}

console.log('10.76.0 admin composition runtime gate: PASS');
