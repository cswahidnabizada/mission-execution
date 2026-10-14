import fs from 'node:fs';
import assert from 'node:assert/strict';
const source=fs.readFileSync('public/assets/js/frontend/admin/product-publisher.js','utf8');
assert(source.includes('function renderWorkspace(w,state)'), 'Publisher renderWorkspace must receive render state');
assert(source.includes('renderWorkspace(w,state)'), 'Publisher renderer must pass state into workspace rendering');
assert(!source.includes("msg.textContent='Activating country…';await api(`/api/platform/admin/countries/${country}/activate`"), 'Publisher start must not silently activate a country');
assert(source.includes('/product-publisher/${launch}/verify'), 'Publisher verify must advance the release lifecycle through its canonical orchestrator');
console.log('10.52.1 Publisher UI Runtime Contract: PASS');
