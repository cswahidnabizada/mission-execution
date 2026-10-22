import assert from 'node:assert/strict';
import fs from 'node:fs';
import {simulate} from '../../public/assets/js/frontend/admin/simulation-engine.js';
import {resolveVirtualDeviceProfile,assertVirtualDeviceSafety,listVirtualDeviceProfiles} from '../../public/assets/js/frontend/admin/simulation-device-profiles.js';
import {replaySimulation} from '../../public/assets/js/frontend/admin/simulation-replay.js';
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
const manifest=JSON.parse(fs.readFileSync('RELEASE-MANIFEST.json','utf8'));
assert.ok(['16.10.80','16.10.81','16.10.82','16.10.83','16.10.84','16.10.85','16.10.86','16.10.87','16.10.89','16.10.90','16.10.91','16.10.92','16.10.93','16.10.94','16.10.95','16.10.96','16.10.97','16.10.98','16.12.0','16.14.0','16.26.0','16.20.0','16.26.0'].includes(pkg.version)); assert.equal(lock.version,pkg.version); assert.equal(lock.packages[''].version,pkg.version);
assert.equal(fs.readFileSync('VERSION','utf8').trim(),pkg.version); assert.equal(manifest.version,pkg.version); assert.ok(['16.10.79','16.10.80','16.10.81','16.10.82','16.10.83','16.10.84','16.10.85','16.10.86','16.10.87','16.10.88','16.10.89','16.10.90','16.10.91','16.10.92','16.10.93','16.10.94','16.10.95','16.10.96','16.10.97','16.10.98','16.16.0','16.17.0','16.18.0','16.19.0','16.26.0','16.26.0','16.20.0','16.21.0','16.26.0'].includes(manifest.base));
assert.equal(listVirtualDeviceProfiles().length,3);
for(const id of ['virtual-van','virtual-robot','virtual-drone']) {
 const p=resolveVirtualDeviceProfile(id); assert.equal(p.safetyEnvelope.simulationOnly,true); assert.equal(p.safetyEnvelope.physicalConnectionAllowed,false); assert.equal(p.safetyEnvelope.actuationEnabled,false); assert.equal(p.safetyEnvelope.productionMutation,false); assert.equal(p.safetyEnvelope.deviceCommandSent,false); assert.equal(assertVirtualDeviceSafety(p).allowed,true);
}
assert.throws(()=>resolveVirtualDeviceProfile('real-drone'),/VIRTUAL_DEVICE_PROFILE_UNSUPPORTED/);
assert.throws(()=>assertVirtualDeviceSafety(resolveVirtualDeviceProfile('virtual-van'),{speedKph:91}),/VIRTUAL_DEVICE_SPEED_LIMIT_EXCEEDED/);
assert.throws(()=>assertVirtualDeviceSafety(resolveVirtualDeviceProfile('virtual-robot'),{payloadKg:51}),/VIRTUAL_DEVICE_PAYLOAD_LIMIT_EXCEEDED/);
assert.throws(()=>assertVirtualDeviceSafety(resolveVirtualDeviceProfile('virtual-drone'),{stage:'EXECUTE'}),/VIRTUAL_DEVICE_PLANNING_ONLY/);
const run=simulate({scenarioId:'normal',executor:'virtual-van',missionId:'SIM-DE-DEVICE-001',deadline:45,seed:'device-safe-seed'});
assert.equal(run.deviceProfile.id,'virtual-van'); assert.equal(run.deviceProfile.safetyEnvelope.actuationEnabled,false); assert.equal(run.deviceCommandSent,false); assert.equal(run.productionMutation,false);
assert.equal(replaySimulation(run).match,true);
const altered=structuredClone(run); altered.deviceProfile.safetyEnvelope.actuationEnabled=true; assert.equal(replaySimulation(altered).match,false);
for(const file of ['public/simulator.html','public/tenant-simulator.html']) assert.match(fs.readFileSync(file,'utf8'),/versioned speed\/payload limits/);
console.log('16.10.75 virtual-device safety profiles and certification contract: PASS');
