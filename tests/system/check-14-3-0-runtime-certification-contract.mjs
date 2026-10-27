import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const version=read('VERSION').trim();
const pkg=JSON.parse(read('package.json'));
const harness=read('tests/runtime/runtime-certification-harness.mjs');
const release=read('RELEASE.md');
assert(['14.5.0','14.6.0','14.7.0','14.8.0','14.9.0','15.0.0','15.0.1','15.1.0','15.2.0','15.3.0','15.5.0','16.0.0','16.2.0','16.4.0','16.5.0','16.6.0','16.7.0','16.8.0','16.9.0','16.9.1','16.9.2','16.9.3','16.9.4','16.10.0','16.10.1','16.10.10','16.10.11','16.10.12','16.10.13','16.10.14','16.10.15','16.10.16','16.10.17','16.10.18','16.10.19','16.10.20','16.10.21','16.10.22','16.10.23','16.10.24','16.10.25','16.10.26','16.10.27','16.10.28','16.10.29','16.10.30','16.10.31','16.10.32','16.10.33','16.10.34','16.10.35','16.10.36','16.10.37','16.10.39','16.10.40','16.10.41','16.10.43','16.10.44','16.10.45','16.10.46','16.10.47','16.10.48','16.10.49','16.10.50','16.10.51','16.10.52','16.10.53','16.10.54','16.10.55','16.10.56','16.10.57','16.10.60','16.10.65','16.10.66','16.10.67','16.10.68','16.10.69','16.10.70','16.10.71','16.10.72','16.10.73','16.10.74','16.10.75','16.10.76','16.10.77','16.10.78','16.10.79','16.10.80','16.10.81','16.10.82','16.10.83','16.10.84','16.10.85','16.10.86','16.10.87','16.10.88','16.10.89','16.10.90','16.10.91','16.10.92','16.10.93','16.10.94','16.10.95','16.10.96','16.10.97','16.10.98','16.10.99','16.20.0','16.26.0','16.49.0','16.51.0','16.52.0','16.53.0'].includes(version));
assert(['14.5.0','14.6.0','14.7.0','14.8.0','14.9.0','15.0.0','15.0.1','15.1.0','15.2.0','15.3.0','15.5.0','16.0.0','16.2.0','16.4.0','16.5.0','16.6.0','16.7.0','16.8.0','16.9.0','16.9.1','16.9.2','16.9.3','16.9.4','16.10.0','16.10.1','16.10.10','16.10.11','16.10.12','16.10.13','16.10.14','16.10.15','16.10.16','16.10.17','16.10.18','16.10.19','16.10.20','16.10.21','16.10.22','16.10.23','16.10.24','16.10.25','16.10.26','16.10.27','16.10.28','16.10.29','16.10.30','16.10.31','16.10.32','16.10.33','16.10.34','16.10.35','16.10.36','16.10.37','16.10.39','16.10.40','16.10.41','16.10.43','16.10.44','16.10.45','16.10.46','16.10.47','16.10.48','16.10.49','16.10.50','16.10.51','16.10.52','16.10.53','16.10.54','16.10.55','16.10.56','16.10.57','16.10.60','16.10.65','16.10.66','16.10.67','16.10.68','16.10.69','16.10.70','16.10.71','16.10.72','16.10.73','16.10.74','16.10.75','16.10.76','16.10.77','16.10.78','16.10.79','16.10.80','16.10.81','16.10.82','16.10.83','16.10.84','16.10.85','16.10.86','16.10.87','16.10.88','16.10.89','16.10.90','16.10.91','16.10.92','16.10.93','16.10.94','16.10.95','16.10.96','16.10.97','16.10.98','16.10.99','16.20.0','16.26.0','16.49.0','16.51.0','16.52.0','16.53.0'].includes(pkg.version));
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
