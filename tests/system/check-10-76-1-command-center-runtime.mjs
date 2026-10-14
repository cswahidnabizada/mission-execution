import assert from 'node:assert/strict';

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;

const listeners = new Map();
const governanceButton = {
  dataset: { governanceOpen: 'audit' },
  addEventListener(type, fn) { listeners.set(type, fn); },
};
const box = {
  innerHTML: '',
  querySelector(selector) {
    if (selector === '#commandApplyScope' || selector === '#commandClearScope' || selector === '#openCertification' || selector === '#retryCommandCenter' || selector === '#openSystemHealth') return null;
    return null;
  },
  querySelectorAll(selector) {
    if (selector === '[data-governance-open]') return [governanceButton];
    return [];
  },
};

globalThis.document = {
  querySelector(selector) { return selector === '#view-overview' ? box : null; },
  querySelectorAll() { return []; },
};
globalThis.window = {};

try {
  const { renderCommandCenter } = await import('../../public/assets/js/frontend/admin/command-center.js?v=10.77.0');
  let navigatedTo = null;
  const navigate = async (view) => { navigatedTo = view; };
  const $ = (selector) => selector === '#view-overview' ? box : null;
  const esc = (value) => String(value ?? '');
  const state = { view: 'overview', data: {} };
  const loadCommandCenter = async () => ({
    surface: { stats: [], workspaceStates: [], queue: [], lifecycle: [] },
    next: { actionKey: 'product-health', actionLabel: 'OPEN' },
    now: { reason: 'Test projection' },
    productLens: {},
    recentOperations: [],
    unavailableAuthorities: [],
    version: '10.77.0',
  });

  await renderCommandCenter({ $, state, esc, loadCommandCenter, api: async () => ({}), navigate });
assert.equal(typeof listeners.get('click'), 'function', 'Governance OPEN action must have a click handler');
  await listeners.get('click')();
  assert.equal(navigatedTo, 'audit', 'Governance OPEN action must navigate through canonical dependency');
}
finally {
  globalThis.document = originalDocument;
  globalThis.window = originalWindow;
}

console.log('10.76.1 Command Center runtime navigation gate: PASS');
