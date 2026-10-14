import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const command = readFileSync('public/assets/js/frontend/admin/command-center.js','utf8');
const governance = readFileSync('public/assets/js/frontend/admin/oversight/platform-governance.js','utf8');
const readiness = readFileSync('public/assets/js/frontend/admin/governance-readiness.js','utf8');

assert.match(command, /renderCommandCenter\(\{\$,state,esc,loadCommandCenter,api,navigate\}\)/, 'Command Center must require canonical navigate dependency');
assert.doesNotMatch(command, /renderCommandCenter\(\{[^}]*\bshow\b/, 'Command Center must not depend on obsolete show parameter');
assert.match(command, /navigate\(b\.dataset\.governanceOpen\)/, 'Governance actions must use canonical navigation');
assert.match(command, /navigate\('certification'\)/, 'Certification action must use canonical navigation');
assert.match(governance, /renderCommandCenter\(\{[^}]*\bnavigate\}\)/, 'Platform governance must pass canonical navigate into Command Center');
assert.match(readiness, /renderGovernanceReadiness\(snapshot,\{navigate\}=\{\}\)/, 'Governance readiness contract must use canonical navigation naming');

console.log('10.76.1 Command Center navigation contract gate: PASS');
