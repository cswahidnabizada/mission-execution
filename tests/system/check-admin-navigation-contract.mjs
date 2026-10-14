import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const version=readFileSync('VERSION','utf8').trim();
const context=readFileSync('public/assets/js/frontend/admin/oversight/context.js','utf8');
const governance=readFileSync('public/assets/js/frontend/admin/data-governance.js','utf8');
const registry=readFileSync('public/assets/js/frontend/admin/panel-registry.js','utf8');
const shell=readFileSync('public/assets/js/frontend/admin/shell.js','utf8');
const command=readFileSync('public/assets/js/frontend/admin/command-center.js','utf8');

assert.doesNotMatch(context,/let\s+show\s*=\s*\(\)\s*=>\s*\{\}/,'Admin navigation must never have a silent no-op fallback');
assert.doesNotMatch(governance,/let\s+show\s*=\s*\(\)\s*=>\s*\{\}/,'Data Governance navigation must never have a silent no-op fallback');
assert.match(context,/if\(typeof fn!=='function'\)throw new TypeError\('Canonical admin navigation is unavailable'\)/,'Admin navigation bridge must fail explicitly when unconfigured');
assert.match(governance,/function navigateGovernance\(\.\.\.args\)/,'Data Governance must use the canonical navigation bridge');
assert.match(registry,/setAdminShow\(show\)/,'Admin registry must bind the canonical controller navigation');
assert.doesNotMatch(registry,/let\s+show\s*=\s*\(\)\s*=>\s*\{\}/,'Admin panel registry must never contain a silent navigation fallback');
assert.match(registry,/setGovernanceShow\(show\)/,'Admin registry must bind governance navigation to the same authority');
assert.match(shell,/renderAdminShell\(\{sections,platformLogout,show,state\}\)/,'Admin shell must receive canonical navigation');
assert.match(command,/typeof navigate!=='function'/,'Command Center must reject missing navigation at composition time');

const files=execFileSync('find',['public/assets/js/frontend/admin','-type','f','-name','*.js'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
const offenders=[];
for(const file of files){
  const text=readFileSync(file,'utf8');
  if(!/\bshow\s*\(/.test(text))continue;
  const declared=/\b(?:const|let|var|function)\s+show\b/.test(text);
  const param=/\{[^}]*\bshow\b[^}]*\}/s.test(text);
  const imported=/import[^;]*\bshow\b[^;]*from/s.test(text);
  const navigateImport=/import[^;]*\bnavigate\b[^;]*from/s.test(text);
  if(!declared&&!param&&!imported&&!navigateImport)offenders.push(file);
}
assert.deepEqual(offenders,[],`Admin modules contain an unbound show() dependency: ${offenders.join(', ')}`);
console.log(`Admin navigation contract gate: PASS (${version})`);
console.log('No silent navigation fallbacks; canonical navigation binding and show()/navigate() dependencies are structurally bound.');
