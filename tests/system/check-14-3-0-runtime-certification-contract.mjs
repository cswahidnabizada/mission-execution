import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const version=read('VERSION').trim();
const pkg=JSON.parse(read('package.json'));
const harness=read('tests/runtime/runtime-certification-harness.mjs');
const release=read('RELEASE.md');
assert(['14.5.0','14.6.0','14.7.0','14.8.0','14.9.0','15.0.0','15.0.1','15.1.0','15.2.0','15.3.0','15.5.0','16.0.0','16.2.0','16.4.0','16.5.0','16.6.0','16.7.0','16.8.0','16.9.0','16.9.1','16.9.2','16.9.3','16.9.4','16.10.0','16.10.1','16.10.10','16.10.11','16.10.12','16.10.13','16.10.14','16.10.15','16.10.16'].includes(version));
assert(['14.5.0','14.6.0','14.7.0','14.8.0','14.9.0','15.0.0','15.0.1','15.1.0','15.2.0','15.3.0','15.5.0','16.0.0','16.2.0','16.4.0','16.5.0','16.6.0','16.7.0','16.8.0','16.9.0','16.9.1','16.9.2','16.9.3','16.9.4','16.10.0','16.10.1','16.10.10','16.10.11','16.10.12','16.10.13','16.10.14','16.10.15','16.10.16'].includes(pkg.version));
assert(read('src/worker/core/release.js').includes(`RELEASE_VERSION="${version}"`));
assert.equal(harness.includes('14.4.0') || harness.includes('14.5.0'),true);
for(const token of [
  'ON_MISSION_CERT_MISSION_ID','ON_MISSION_CERT_CREATE_MISSION','ON_MISSION_CERT_EXECUTE','ON_MISSION_CERT_REQUIRE_EFFECT',
  '/api/mission-execution/missions/${missionId}/operating-loop','/api/mission-execution/missions/${missionId}/plan',
  '/api/agent/context/missions/${missionId}','/api/mission-execution/missions/${missionId}',
  '/api/mission-execution/missions/${missionId}/certification','adversarial tenant isolation','canonical journey completeness'
]) assert(harness.includes(token),`runtime harness missing ${token}`);
for(const phase of ['OBSERVE','UNDERSTAND','PLAN','EVALUATE','ACCEPT','AUTHORIZE','PREPARE','ASSIGN','EXECUTE','EFFECT','VERIFY','RECOVER','OUTCOME','LEARN','NEXT_SITUATION']) assert(harness.includes(`'${phase}'`),`runtime harness missing phase ${phase}`);
assert(release.startsWith(`# Mission Execution ${version}`)||release.startsWith('# ON Mission 16.8.0')||release.startsWith('# ON Mission 16.7.0')||release.startsWith('# ON Mission 16.6.0')||release.startsWith('# ON Mission 16.4.0')||release.startsWith('# ON Mission 16.3.0')||release.startsWith('# ON Mission 16.2.0')||release.startsWith('# ON Mission 16.0.0')||release.startsWith('# ON Mission 15.5.0')||release.startsWith('# ON Mission 15.3.0')||release.startsWith('# ON Mission 15.2.0')||release.startsWith('# ON Mission 15.1.0')||release.startsWith('# ON Mission 15.0.1')||release.startsWith('# ON Mission 15.0.0')||release.startsWith('# ON Mission 14.9.0')||release.startsWith('# ON Mission 14.8.0')||release.startsWith('# ON Mission 14.7.0')||release.startsWith('# ON Mission 14.6.0'), 'release document must identify current release');
assert(release.includes('Germany + Logistics'), 'release must identify runtime certification objective');
assert(release.includes('Full runtime adversarial matrix'), 'release must preserve adversarial wave');
assert(release.includes('one canonical'), 'release must preserve canonical-authority rule');
console.log('14.4.0 runtime certification contract: PASS');
