import fs from 'node:fs';
import path from 'node:path';
import {allActionDefinitions} from '../src/worker/extensions/actions-intelligence/action-registry.js';
import {mappedActionCodes} from '../src/worker/extensions/actions-intelligence/action-service-map.js';
import {allTruthDefinitions} from '../src/worker/extensions/mission-truth/mission-truth-registry.js';
import {LOGISTICS_LIFECYCLE_DEFINITION} from '../src/worker/domains/logistics/logistics-lifecycle.contract.js';
import {RELEASE_VERSION} from '../src/worker/core/release.js';
const root=process.cwd();
const files=[];
function walk(d){for(const n of fs.readdirSync(d)){if(['node_modules','.git'].includes(n))continue;const p=path.join(d,n),st=fs.statSync(p);if(st.isDirectory())walk(p);else if(/\.(js|mjs|html)$/.test(n))files.push(p)}}
walk(root);
const texts=new Map(files.map(p=>[path.relative(root,p).replaceAll(path.sep,'/'),fs.readFileSync(p,'utf8')]));
const legacyPath=path.join(root,'src/worker/core/canonical-lifecycle-registry.js');
if(fs.existsSync(legacyPath))throw new Error('Legacy lifecycle authority file remains');
const actionSet=new Set(allActionDefinitions().map(x=>x.code));
const serviceSet=new Set(mappedActionCodes());
const missingService=[...actionSet].filter(x=>!serviceSet.has(x));
const lifecycleWriters=[...texts].filter(([f,t])=>f.startsWith('src/worker/') && /UPDATE\s+missions\s+SET\s+status\s*=|INSERT\s+INTO\s+mission_status_history\s*\(/i.test(t)).map(([f])=>f);
const report=[];
report.push(`# ON Mission ${RELEASE_VERSION} — Canonical Convergence Audit`,'',`Generated: ${new Date().toISOString()}`,'',`- Release authority: /VERSION → ${RELEASE_VERSION}`,`- Generic lifecycle authority: src/worker/security/sector-lifecycle.service.js`,`- Logistics lifecycle contract: src/worker/domains/logistics/logistics-lifecycle.contract.js`,`- Lifecycle definitions in logistics contract: ${LOGISTICS_LIFECYCLE_DEFINITION.states.length} states / ${LOGISTICS_LIFECYCLE_DEFINITION.transitions.length} transitions`,`- Canonical actions: ${actionSet.size}`,`- Action Service Map routes: ${serviceSet.size}`,`- Missing action routes: ${missingService.length}`,`- Canonical truth definitions: ${allTruthDefinitions().length}`,`- Lifecycle writers detected: ${lifecycleWriters.length}`,'','## Required architecture','','- Control Plane / Operations Plane','- Product Contract → Sector Contract → Lifecycle Definition → Domain Adapter','- Canonical Core owns generic truth, identity, authorization, liveness and events','- Command / Query API separates D1 mutations from UI projections','- No legacy canonical lifecycle registry','');
console.log(report.join('\n'));
if(missingService.length) { console.error(`Canonical convergence audit: FAIL — ${missingService.length} action routes missing`); process.exit(1); }
console.log(`Canonical convergence audit: PASS (${RELEASE_VERSION}) — lifecycle authority is product/sector driven.`);
