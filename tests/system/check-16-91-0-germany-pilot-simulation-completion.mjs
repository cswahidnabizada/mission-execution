import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SCENARIOS,JOURNEY,simulate} from '../../public/assets/js/frontend/admin/simulation-engine.js';

const version=fs.readFileSync('VERSION','utf8').trim();
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
const manifest=JSON.parse(fs.readFileSync('RELEASE-MANIFEST.json','utf8'));
const release=fs.readFileSync('RELEASE.md','utf8');
const report=fs.readFileSync('RELEASE-REPORT.txt','utf8');
const html=fs.readFileSync('public/simulator.html','utf8');
const scripts=pkg.scripts;

assert.equal(version,'16.91.0');
assert.equal(pkg.version,'16.91.0');
assert.equal(lock.version,'16.91.0');
assert.equal(lock.packages[''].version,'16.91.0');
assert.equal(manifest.version,'16.117.0');
assert.match(release,/16\.91\.0 — Germany Pilot Simulation Completion/);
assert.match(release,/not a live customer pilot/i);
assert.match(report,/No database migration/);
assert.match(scripts['check:release'],/check-16-91-0-germany-pilot-simulation-completion\.mjs/);
assert.equal(JOURNEY[0],'OBSERVE');
assert.equal(JOURNEY.at(-1),'NEXT SITUATION');
assert.equal(Object.keys(SCENARIOS).length,8);

for (const id of Object.keys(SCENARIOS)) {
  const run=simulate({scenarioId:id,executor:'virtual-van',missionId:`SIM-DE-${id.replace(/[^a-z0-9]/gi,'').slice(0,20).padEnd(3,'0')}`,deadline:120,seed:'16.91-regression'});
  assert.equal(run.simulationOnly,true);
  assert.equal(run.realWorldEffects,false);
  assert.equal(run.productionMutation,false);
  assert.equal(run.deviceCommandSent,false);
  assert.equal(run.journey.length,JOURNEY.length);
  assert.ok(run.evidence.every(e=>e.classification==='SIMULATED'));
}
const late=simulate({scenarioId:'late-delivery',executor:'virtual-van',missionId:'SIM-DE-LATE',deadline:120});
assert.equal(late.status,'BLOCKED');
assert.equal(late.recoveryStatus,'ESCALATION_REQUIRED');
const missing=simulate({scenarioId:'missing-proof',executor:'virtual-van',missionId:'SIM-DE-PROOF',deadline:120});
assert.equal(missing.status,'BLOCKED');
assert.equal(missing.recoveryStatus,'PROOF_REQUIRED');
assert.equal(missing.journey.find(x=>x.stage==='VERIFY').status,'BLOCKED');
const cancelled=simulate({scenarioId:'cancel-before-execution',executor:'virtual-van',missionId:'SIM-DE-CANCEL',deadline:120});
assert.equal(cancelled.status,'BLOCKED');
assert.equal(cancelled.recoveryStatus,'CANCELLED_BEFORE_EXECUTION');
for (const id of ['late-delivery','missing-proof','cancel-before-execution']) assert.match(html,new RegExp(`value="${id}"`));
console.log('16.91.0 Germany pilot simulation completion: PASS');
