import fs from 'node:fs';
import assert from 'node:assert/strict';
const journey = [
  'OBSERVE','UNDERSTAND','PLAN','EVALUATE','ACCEPT','AUTHORIZE','PREPARE','ASSIGN',
  'EXECUTE','EFFECT','VERIFY','RECOVER','OUTCOME','LEARN','NEXT SITUATION','OBSERVE'
];
const doc = fs.readFileSync('docs/16.10.12-CANONICAL-JOURNEY-CERTIFICATION.md','utf8');
const migration = fs.readFileSync('database/migrations/0158_journey_and_environment_gate_convergence.sql','utf8');
const infra = fs.readFileSync('public/assets/js/frontend/admin/infrastructure-governance.js','utf8');
const test15 = fs.readFileSync('tests/system/check-15-0-0-real-end-to-end-mission.mjs','utf8');
const recovery = fs.readFileSync('tests/system/check-14-9-0-runtime-recovery-certification.mjs','utf8');
const continuity = fs.readFileSync('tests/system/check-13-6-0-mission-continuity.mjs','utf8');
const journeyLine = doc.split('\n').find(line => line.includes('`OBSERVE → UNDERSTAND'));
assert.ok(journeyLine, 'canonical journey line exists');
let cursor = -1;
for (const phase of journey) {
  const next = journeyLine.indexOf(phase, cursor + 1);
  assert.ok(next > cursor, `canonical journey phase ordered: ${phase}`);
  cursor = next;
}
for (const phase of journey.slice(0,-1)) assert.ok(doc.includes(`| ${phase} |`), `phase proof obligations documented: ${phase}`);
assert.match(migration,/INSERT OR IGNORE INTO platform_infrastructure_roadmap/);
assert.match(migration,/task_key IN \('prod-eu-d1','prod-release-pipeline'\)/);
assert.match(migration,/REPLACE\(depends_on_json,'"dev-isolation"','"environment-boundaries"'\)/);
assert.doesNotMatch(migration,/DROP TABLE|DELETE FROM platform_infrastructure_resources|UPDATE platform_infrastructure_resources\s+SET provider_reference/i);
assert.match(infra,/No provider operation was performed/);
assert.match(test15,/real end-to-end mission platform/);
assert.match(recovery,/recovery certification/);
assert.match(continuity,/next situation/i);
console.log('16.10.12 Canonical Journey + Infrastructure Gate Convergence: PASS');
